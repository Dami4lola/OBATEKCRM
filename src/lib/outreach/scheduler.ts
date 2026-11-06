import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from '@/types/database'
import {
  claimDueRuns,
  countLeadsAuditedSince,
  fetchLeadIdsWithEmailsSince,
  fetchLeadsByIds,
  fetchRecentFitSignals,
  fetchSettings,
  fetchUndraftedEmailIds,
  finishRun,
  getOrCreateSignalRun,
  insertRunEmails,
} from './adapters/obatek-crm'
import { gatherLeads, runEmailRows, scheduledRunChoice } from './gather'
import { prepareEmail, PrepareError } from './prepare-email'
import { errorMessage } from './errors'
import { runLeadAudit } from './run-audit'
import { parseSignals } from './scoring'
import { localParts } from './sequence'
import type { OutreachSettings } from './settings'

// What the scheduler's tick does with runs (OUTREACH_PLAN.md §11): start
// the ones that are due, then write their drafts a few at a time. Sending
// stays manual until auto mode (stage 9).

type Crm = SupabaseClient<Database>

const RUNS_PER_TICK = 2

export interface StartedRun {
  runId: string
  drafts: number
  blocked: number
  error?: string
}

function excludedLeadIds(summary: Json): string[] {
  if (!summary || typeof summary !== 'object' || Array.isArray(summary)) return []
  const ids = summary.excluded_lead_ids
  return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string') : []
}

// Due runs re-gather the New stage now, skipping leads unticked when the
// run was scheduled
export async function startDueRuns(crm: Crm, now = new Date()): Promise<StartedRun[]> {
  const runs = await claimDueRuns(crm, now, RUNS_PER_TICK)
  const started: StartedRun[] = []

  for (const run of runs) {
    const summary = (run.summary ?? {}) as Record<string, Json>
    try {
      const settings = await fetchSettings(crm)
      const { rows } = await gatherLeads(crm, settings, now)
      const emails = runEmailRows(run.id, rows, scheduledRunChoice(excludedLeadIds(run.summary)))
      await insertRunEmails(crm, emails)

      const drafts = emails.filter((e) => e.status === 'draft').length
      const blocked = emails.length - drafts
      if (drafts === 0) {
        await finishRun(crm, run.id, 'completed', { ...summary, sent: 0, blocked, note: 'No leads to email when the run fired' })
      }
      started.push({ runId: run.id, drafts, blocked })
    } catch (error) {
      const message = errorMessage(error)
      await finishRun(crm, run.id, 'failed', { ...summary, error: message })
      started.push({ runId: run.id, drafts: 0, blocked: 0, error: message })
    }
  }
  return started
}

export interface DraftPendingResult {
  drafted: number
  // Why drafting stopped early (daily cap, Claude down), if it did
  stopped: string | null
}

export async function draftPending(
  crm: Crm,
  limit: number,
  keys: { placesKey: string | undefined; pagespeedKey: string | undefined }
): Promise<DraftPendingResult> {
  const result: DraftPendingResult = { drafted: 0, stopped: null }
  const ids = await fetchUndraftedEmailIds(crm, limit)

  // One at a time: each draft is a Claude call, and the daily cap is checked per draft
  for (const id of ids) {
    try {
      await prepareEmail(crm, id, keys)
      result.drafted++
    } catch (error) {
      // Gone, or already reviewed in the pop-up: skip it
      if (error instanceof PrepareError && (error.status === 404 || error.status === 409)) continue
      // The cap, or something every draft would hit: try again next tick
      result.stopped = errorMessage(error)
      break
    }
  }
  return result
}

// ---------- Buying signals (§3, stage 8.1) ----------

// How long after its post a signal lead is still picked up
const SIGNAL_WINDOW_DAYS = 3
// Site checks per tick for new signal leads; each can take ~20s
const SIGNAL_AUDITS_PER_TICK = 4

export interface SignalAuditResult {
  audited: number
  errors: string[]
}

// New signal leads get their site check without waiting for Check sites:
// it finds the email and owner, and the agency profile
export async function auditSignalLeads(
  crm: Crm,
  settings: OutreachSettings,
  keys: { placesKey: string | undefined; pagespeedKey: string | undefined },
  now = new Date()
): Promise<SignalAuditResult> {
  const result: SignalAuditResult = { audited: 0, errors: [] }
  const signals = await fetchRecentFitSignals(crm, new Date(now.getTime() - SIGNAL_WINDOW_DAYS * 86_400_000))
  const ids = [...new Set(signals.map((s) => s.lead_id as string))]
  if (ids.length === 0) return result

  const unaudited = (await fetchLeadsByIds(crm, ids)).filter((lead) => !lead.audited_at)
  if (unaudited.length === 0) return result

  const startOfDay = new Date(now)
  startOfDay.setHours(0, 0, 0, 0)
  const room = settings.audit_daily_cap - (await countLeadsAuditedSince(crm, startOfDay))
  for (const lead of unaudited.slice(0, Math.max(0, Math.min(room, SIGNAL_AUDITS_PER_TICK)))) {
    try {
      // Posts often have no website: the Google listing lookup finds it
      await runLeadAudit(crm, lead, { checkReviews: false, lookupListing: true, ...keys })
      result.audited++
    } catch (error) {
      result.errors.push(`${lead.company_name ?? lead.contact_name}: ${errorMessage(error)}`)
    }
  }
  return result
}

export interface SignalRunResult {
  runId: string | null
  added: number
}

function localDay(now: Date, timeZone: string): string {
  const p = localParts(now, timeZone)
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`
}

// Checked signal leads in New go into today's "Buying signals" run, once
// each; the tick then drafts them for one-click review. Leads still
// waiting for their site check are picked up on a later tick, and ones the
// compliance gate blocks (no email yet) are left for Lusha or a call.
export async function queueSignalLeads(crm: Crm, settings: OutreachSettings, now = new Date()): Promise<SignalRunResult> {
  const signals = await fetchRecentFitSignals(crm, new Date(now.getTime() - SIGNAL_WINDOW_DAYS * 86_400_000))
  const ids = new Set(signals.map((s) => s.lead_id as string))
  if (ids.size === 0) return { runId: null, added: 0 }

  const already = await fetchLeadIdsWithEmailsSince(
    crm,
    [...ids],
    new Date(now.getTime() - settings.resequence_cooldown_days * 86_400_000)
  )
  const { rows } = await gatherLeads(crm, settings, now)
  const chosen = rows.filter(
    (row) =>
      ids.has(row.lead.id) &&
      !already.has(row.lead.id) &&
      !!row.lead.audited_at &&
      !row.blocked &&
      !parseSignals(row.lead.signals).off_target
  )
  if (chosen.length === 0) return { runId: null, added: 0 }

  const run = await getOrCreateSignalRun(crm, localDay(now, settings.send_timezone), now)
  const chosenIds = new Set(chosen.map((row) => row.lead.id))
  await insertRunEmails(crm, runEmailRows(run.id, chosen, (row) => chosenIds.has(row.lead.id)))
  return { runId: run.id, added: chosen.length }
}
