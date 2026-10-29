import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from '@/types/database'
import { claimDueRuns, fetchSettings, fetchUndraftedEmailIds, finishRun, insertRunEmails } from './adapters/obatek-crm'
import { gatherLeads, runEmailRows, scheduledRunChoice } from './gather'
import { prepareEmail, PrepareError } from './prepare-email'

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

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
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
