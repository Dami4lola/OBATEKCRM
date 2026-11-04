import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, LeadSignal } from '@/types/database'
import {
  fetchExistingContacts,
  fetchLatestSignalAt,
  fetchPendingSignals,
  fetchRecentSignalDomains,
  findLeadIdByHost,
  findLeadIdByName,
  findStageByName,
  insertSignals,
  logActivity,
  fetchLead,
  pushLeads,
  setSetting,
  updateLead,
  updateSignal,
} from './adapters/obatek-crm'
import { regionRoles, signalRow, signalTitle, signalToLead } from './job-signals'
import { localParts, startOfLocalDay } from './sequence'
import type { OutreachSettings, SignalRegion } from './settings'
import { checkSignalFit, type SignalFitResult } from './signal-fit'
import { findLocationId, searchJobs, TheirStackError, type JobPost, type JobSearch } from './theirstack-client'
import { parseSignals } from './scoring'

// The daily buying-signal pull (OUTREACH_PLAN.md §3): job posts from
// TheirStack, a deterministic filter, a Claude fit check, then fit posts
// become leads in New (or tag the lead that's already there).

type Crm = SupabaseClient<Database>

// Fit checks at once; each is a short Haiku call
const FIT_CONCURRENCY = 4
// How far back a company counts as already seen
const SKIP_DOMAIN_DAYS = 30
const SKIP_DOMAIN_MAX = 100
// Overlap with the last stored post, for posts TheirStack files late
const DISCOVERED_OVERLAP_MS = 10 * 60_000

export interface PullSignalsDeps {
  search?: (apiKey: string, search: JobSearch) => Promise<JobPost[]>
  findLocation?: typeof findLocationId
  checkFit?: (model: string, signal: LeadSignal) => Promise<SignalFitResult | null>
}

export interface PullSignalsResult {
  // Null when it ran; otherwise why not
  skipped: string | null
  fetched: number
  stored: number
  dropped: number
  fit: number
  notFit: number
  leadsCreated: number
  matched: number
  errors: string[]
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

// Once a day, after signal_pull_hour in the send timezone
export function signalPullDue(
  settings: Pick<OutreachSettings, 'signal_pull_hour' | 'signals_pulled_at' | 'send_timezone'>,
  now: Date
): boolean {
  if (localParts(now, settings.send_timezone).minutes < settings.signal_pull_hour * 60) return false
  if (!settings.signals_pulled_at) return true
  return new Date(settings.signals_pulled_at) < startOfLocalDay(now, settings.send_timezone)
}

function locationKey(region: SignalRegion, name: string) {
  return `${region.country}:${name}`
}

// TheirStack location ids for a region's places, looked up once and cached.
// Empty when any place is unknown: the search then covers the country and
// inRegion() does the narrowing.
async function regionLocationIds(
  crm: Crm,
  apiKey: string,
  region: SignalRegion,
  cache: Record<string, number>,
  findLocation: typeof findLocationId
): Promise<number[]> {
  let changed = false
  for (const place of region.places) {
    const key = locationKey(region, place.name)
    if (key in cache) continue
    const id = await findLocation(apiKey, place.name, region.country, place.state_code ? 'state' : 'city')
    // 0 marks "looked, not found" so it isn't looked up every day
    cache[key] = id ?? 0
    changed = true
  }
  if (changed) await setSetting(crm, 'signal_location_ids', cache)
  const ids = region.places.map((place) => cache[locationKey(region, place.name)])
  return ids.every((id) => id > 0) ? ids : []
}

async function inBatches<T>(items: T[], size: number, run: (item: T) => Promise<void>) {
  for (let i = 0; i < items.length; i += size) {
    await Promise.all(items.slice(i, i + size).map(run))
  }
}

export async function pullSignals(
  crm: Crm,
  options: {
    apiKey: string
    settings: OutreachSettings
    canClassify: boolean
    now?: Date
    // The Pull now button: runs even if today's pull already happened
    force?: boolean
  },
  deps: PullSignalsDeps = {}
): Promise<PullSignalsResult> {
  const { apiKey, settings, canClassify, force = false } = options
  const now = options.now ?? new Date()
  const search = deps.search ?? searchJobs
  const findLocation = deps.findLocation ?? findLocationId
  const checkFit = deps.checkFit ?? checkSignalFit
  const result: PullSignalsResult = {
    skipped: null,
    fetched: 0,
    stored: 0,
    dropped: 0,
    fit: 0,
    notFit: 0,
    leadsCreated: 0,
    matched: 0,
    errors: [],
  }

  if (!force && !signalPullDue(settings, now)) {
    result.skipped = 'not due'
    return result
  }
  // Marked first: a pull that fails halfway isn't retried every 5 minutes
  // (each retry would spend credits)
  await setSetting(crm, 'signals_pulled_at', now.toISOString())

  // 1. Fetch and store every post, dropped ones included. Only posts found
  // since the newest one stored, so a post is never bought twice and a
  // failed pull leaves no gap.
  const cache = { ...settings.signal_location_ids }
  const [skipDomains, latest] = await Promise.all([
    fetchRecentSignalDomains(crm, new Date(now.getTime() - SKIP_DOMAIN_DAYS * 86_400_000), SKIP_DOMAIN_MAX),
    fetchLatestSignalAt(crm),
  ])
  const latestMs = latest ? new Date(latest).getTime() : NaN
  const discoveredSince = Number.isNaN(latestMs) ? null : new Date(latestMs - DISCOVERED_OVERLAP_MS).toISOString()
  for (const region of settings.signal_regions) {
    if (region.daily_jobs <= 0) continue
    const roles = regionRoles(settings, region)
    try {
      const locationIds = await regionLocationIds(crm, apiKey, region, cache, findLocation)
      const jobs = await search(apiKey, {
        roles,
        maxAgeDays: settings.signal_max_age_days,
        countryCode: region.country,
        locationIds,
        staffRange: settings.signal_staff_range,
        skipDomains,
        discoveredSince,
        limit: region.daily_jobs,
      })
      result.fetched += jobs.length
      const stored = await insertSignals(
        crm,
        jobs.map((job) => signalRow(job, region, roles, settings.signal_staff_range, now))
      )
      result.stored += stored.length
      result.dropped += stored.filter((s) => s.status === 'discarded').length
    } catch (error) {
      result.errors.push(`${region.name}: ${errorMessage(error)}`)
      // Bad key or no credits: the other regions would fail the same way
      if (error instanceof TheirStackError && error.stopAll) break
    }
  }

  if (!canClassify) return result

  // 2. Fit check whatever is waiting, including posts a refusal or an
  // outage left pending last time
  const maxChecks = settings.signal_regions.reduce((sum, r) => sum + Math.max(0, r.daily_jobs), 0)
  const pending = await fetchPendingSignals(crm, maxChecks)
  const fits: LeadSignal[] = []
  await inBatches(pending, FIT_CONCURRENCY, async (signal) => {
    try {
      const verdict = await checkFit(settings.signal_fit_model, signal)
      if (!verdict) return
      const updated = await updateSignal(crm, signal.id, {
        fit: verdict.fit,
        fit_target: verdict.target,
        fit_reason: verdict.reason,
        fit_checked_at: new Date().toISOString(),
        ...(verdict.fit === 'not_fit' ? { status: 'discarded' as const } : {}),
      })
      if (verdict.fit === 'fit') fits.push(updated)
      else result.notFit++
    } catch (error) {
      result.errors.push(`Fit check: ${errorMessage(error)}`)
    }
  })
  result.fit = fits.length
  if (fits.length === 0) return result

  // 3. Fit posts become leads, or tag the lead already in the CRM
  const stage = await findStageByName(crm, settings.source_stage_name)
  if (!stage) {
    result.errors.push(`No pipeline stage named "${settings.source_stage_name}"`)
    return result
  }
  const existing = await fetchExistingContacts(crm)
  // Two posts from one company in the same pull share a lead
  const leadByCompany = new Map<string, string>()

  for (const signal of fits.sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    try {
      const host = signal.company_domain
      // No website on the post: match on the name within the state
      const companyKey = host ?? `${(signal.company_name ?? '').trim().toLowerCase()}|${signal.state_code ?? ''}`
      let leadId = leadByCompany.get(companyKey) ?? null
      if (!leadId && !host && signal.company_name?.trim()) {
        leadId = await findLeadIdByName(crm, signal.company_name.trim(), signal.state_code)
      }
      if (!leadId && host && existing.hosts.has(host)) {
        leadId = await findLeadIdByHost(crm, host)
        if (!leadId) {
          // Deleted with Clean up before: leave it deleted
          await updateSignal(crm, signal.id, { status: 'discarded', fit_reason: `${signal.fit_reason ?? ''} Deleted before with Clean up.`.trim() })
          continue
        }
      }

      if (leadId) {
        const lead = await fetchLead(crm, leadId)
        if (lead && !parseSignals(lead.signals).hiring) {
          const signals = { ...(lead.signals as Record<string, unknown>), hiring: true }
          await updateLead(crm, leadId, { signals: signals as Record<string, boolean | string> })
        }
        await updateSignal(crm, signal.id, { lead_id: leadId, status: 'matched_existing' })
        result.matched++
      } else {
        const [lead] = await pushLeads(crm, stage.id, [signalToLead(signal)])
        leadId = lead.id
        await updateSignal(crm, signal.id, { lead_id: leadId, status: 'lead_created' })
        result.leadsCreated++
      }
      leadByCompany.set(companyKey, leadId)

      await logActivity(crm, {
        lead_id: leadId,
        type: 'note',
        title: signalTitle(signal),
        description: signal.fit_reason,
        meta: { signal_id: signal.id, job_url: signal.job_url, source: signal.source },
      })
    } catch (error) {
      result.errors.push(`${signal.company_name ?? 'Signal'}: ${errorMessage(error)}`)
    }
  }
  return result
}
