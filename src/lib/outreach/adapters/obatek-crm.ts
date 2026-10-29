import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  ActivityInsert,
  CopyFeedbackInsert,
  Database,
  Lead,
  LeadUpdate,
  Json,
  OutreachEmail,
  OutreachEmailInsert,
  OutreachEmailUpdate,
  OutreachRun,
  Stage,
  SuppressionReason,
} from '@/types/database'
import { parseOutreachSettings, type OutreachSettings } from '../settings'
import { existingContactsFrom, type CandidateLead, type ExistingContacts } from '../sourcing'
import type { CopyExample } from '../copywriter'
import { parseSteps } from '../templates'

// The engine's only way into the OBATEK CRM database. A webhook or CSV
// adapter for another CRM would offer these same functions.
type Crm = SupabaseClient<Database>

const PAGE_SIZE = 1000

export async function fetchSettings(crm: Crm): Promise<OutreachSettings> {
  const { data, error } = await crm.from('outreach_settings').select('*')
  if (error) throw error
  return parseOutreachSettings(data || [])
}

export async function findStageByName(crm: Crm, name: string): Promise<Stage | null> {
  const { data, error } = await crm
    .from('stages')
    .select('*')
    .ilike('name', name)
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data
}

// For dedupe: every lead's place id, website and phone, plus businesses
// deleted with Clean up so they aren't sourced again
export async function fetchExistingContacts(crm: Crm): Promise<ExistingContacts> {
  const rows: { google_place_id: string | null; website: string | null; phone: string | null }[] = []

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await crm
      .from('leads')
      .select('google_place_id, website, phone')
      .range(from, from + PAGE_SIZE - 1)
    if (error) throw error
    rows.push(...(data || []))
    if (!data || data.length < PAGE_SIZE) break
  }

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await crm
      .from('dismissed_leads')
      .select('google_place_id, website_host, phone_digits')
      .range(from, from + PAGE_SIZE - 1)
    // Before 006_dismissed_leads.sql is applied the table doesn't exist
    if (error) break
    rows.push(
      ...(data || []).map((row) => ({
        google_place_id: row.google_place_id,
        website: row.website_host,
        phone: row.phone_digits,
      }))
    )
    if (!data || data.length < PAGE_SIZE) break
  }

  return existingContactsFrom(rows)
}

export async function countLeadsSourcedSince(crm: Crm, since: Date): Promise<number> {
  const { count, error } = await crm
    .from('leads')
    .select('id', { count: 'exact', head: true })
    .eq('lead_source', 'places')
    .gte('created_at', since.toISOString())
  if (error) throw error
  return count ?? 0
}

// Appends to the end of the stage, like the importer
export async function pushLeads(
  crm: Crm,
  stageId: string,
  leads: CandidateLead[]
): Promise<Lead[]> {
  if (leads.length === 0) return []

  const { data: last, error: lastError } = await crm
    .from('leads')
    .select('position_index')
    .eq('stage_id', stageId)
    .order('position_index', { ascending: false })
    .limit(1)
  if (lastError) throw lastError

  let position = last?.[0]?.position_index ?? -1
  const { data, error } = await crm
    .from('leads')
    .insert(leads.map((lead) => ({ ...lead, stage_id: stageId, position_index: ++position })))
    .select()
  if (error) throw error
  return data || []
}

export async function fetchLead(crm: Crm, id: string): Promise<Lead | null> {
  const { data, error } = await crm.from('leads').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return data
}

export async function updateLead(crm: Crm, id: string, updates: LeadUpdate): Promise<Lead> {
  const { data, error } = await crm.from('leads').update(updates).eq('id', id).select().single()
  if (error) throw error
  return data
}

export async function countLeadsAuditedSince(crm: Crm, since: Date): Promise<number> {
  const { count, error } = await crm
    .from('leads')
    .select('id', { count: 'exact', head: true })
    .gte('audited_at', since.toISOString())
  if (error) throw error
  return count ?? 0
}

// google_place_id is unique, so check before saving one found by a lookup
export async function findLeadIdByPlaceId(crm: Crm, placeId: string): Promise<string | null> {
  const { data, error } = await crm
    .from('leads')
    .select('id')
    .eq('google_place_id', placeId)
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data?.id ?? null
}

export async function fetchOutreachEmail(crm: Crm, id: string): Promise<OutreachEmail | null> {
  const { data, error } = await crm.from('outreach_emails').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return data
}

export async function updateOutreachEmail(
  crm: Crm,
  id: string,
  updates: OutreachEmailUpdate
): Promise<OutreachEmail> {
  const { data, error } = await crm
    .from('outreach_emails')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function countDraftsSince(crm: Crm, since: Date): Promise<number> {
  const { count, error } = await crm
    .from('outreach_emails')
    .select('id', { count: 'exact', head: true })
    .gte('drafted_at', since.toISOString())
  if (error) throw error
  return count ?? 0
}

// Winning emails for the prompt, same vertical first (§9)
export async function fetchCopyExamples(
  crm: Crm,
  vertical: string | null,
  limit: number
): Promise<CopyExample[]> {
  if (limit <= 0) return []
  const { data, error } = await crm
    .from('outreach_emails')
    .select('opener, steps, leads(vertical)')
    .eq('is_example', true)
    .not('opener', 'is', null)
    .order('sent_at', { ascending: false, nullsFirst: false })
    .limit(50)
  if (error) throw error

  const examples = (data || []).map((row) => ({
    vertical: (row.leads as { vertical: string | null } | null)?.vertical ?? null,
    subject: parseSteps(row.steps)[0]?.subject ?? '',
    opener: row.opener ?? '',
  }))
  return examples
    .filter((e) => e.subject && e.opener)
    .sort((a, b) => Number(b.vertical === vertical) - Number(a.vertical === vertical))
    .slice(0, limit)
}

// Standing writing rules for a draft: the ones for every lead plus the
// lead's vertical, newest first
export async function fetchCopyRules(crm: Crm, vertical: string | null, limit = 20): Promise<string[]> {
  const { data, error } = await crm
    .from('copy_feedback')
    .select('note, vertical')
    .eq('active', true)
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) throw error
  return (data || [])
    .filter((rule) => rule.vertical === null || rule.vertical === vertical)
    .slice(0, limit)
    .map((rule) => rule.note)
}

export async function saveCopyFeedback(crm: Crm, feedback: CopyFeedbackInsert): Promise<void> {
  const { error } = await crm.from('copy_feedback').insert(feedback)
  if (error) throw error
}

// A run moves to review once its first draft exists
export async function markRunAwaitingReview(crm: Crm, runId: string): Promise<void> {
  const { error } = await crm
    .from('outreach_runs')
    .update({ status: 'awaiting_review' })
    .eq('id', runId)
    .eq('status', 'preparing')
  if (error) throw error
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size))
  return chunks
}

// Do-not-contact emails and domains, lowercased (Supabase caps a select at
// 1000 rows, so page through)
export async function fetchSuppressions(
  crm: Crm
): Promise<{ emails: Set<string>; domains: Set<string> }> {
  const emails = new Set<string>()
  const domains = new Set<string>()
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await crm
      .from('suppression_list')
      .select('email, domain')
      .range(from, from + PAGE_SIZE - 1)
    if (error) throw error
    for (const row of data || []) {
      if (row.email) emails.add(row.email.toLowerCase())
      if (row.domain) domains.add(row.domain.toLowerCase())
    }
    if (!data || data.length < PAGE_SIZE) break
  }
  return { emails, domains }
}

// Most recent outreach send per lead, for the re-contact cooldown
export async function fetchLastSentAt(crm: Crm, leadIds: string[]): Promise<Map<string, Date>> {
  const lastSentAt = new Map<string, Date>()
  // Keep each IN list short enough for the request URL
  for (const ids of chunk(leadIds, 100)) {
    const { data, error } = await crm
      .from('outreach_emails')
      .select('lead_id, sent_at')
      .in('lead_id', ids)
      .not('sent_at', 'is', null)
    if (error) throw error
    for (const row of data || []) {
      const sentAt = new Date(row.sent_at!)
      const current = lastSentAt.get(row.lead_id)
      if (!current || sentAt > current) lastSentAt.set(row.lead_id, sentAt)
    }
  }
  return lastSentAt
}

export async function countSentSince(crm: Crm, since: Date): Promise<number> {
  const { count, error } = await crm
    .from('outreach_emails')
    .select('id', { count: 'exact', head: true })
    .gte('sent_at', since.toISOString())
  if (error) throw error
  return count ?? 0
}

export async function logActivity(crm: Crm, activity: ActivityInsert): Promise<void> {
  const { error } = await crm.from('activities').insert(activity)
  // Same external_id logged before (a retried send): nothing to add
  if (error && error.code !== '23505') throw error
}

// Moves the lead to the top of a stage with the existing move_lead RPC
export async function moveLeadToStage(crm: Crm, leadId: string, stageId: string): Promise<void> {
  const { error } = await crm.rpc('move_lead', {
    p_lead_id: leadId,
    p_new_stage_id: stageId,
    p_new_position: 0,
  })
  if (error) throw error
}

export async function fetchLeadsInStage(crm: Crm, stageId: string): Promise<Lead[]> {
  const { data, error } = await crm
    .from('leads')
    .select('*')
    .eq('stage_id', stageId)
    .order('position_index', { ascending: true })
  if (error) throw error
  return data || []
}

// Scheduled runs that are due, moved to preparing. The status check in the
// update means two ticks can't both start the same run.
export async function claimDueRuns(crm: Crm, now: Date, limit: number): Promise<OutreachRun[]> {
  const { data: due, error } = await crm
    .from('outreach_runs')
    .select('*')
    .eq('status', 'scheduled')
    .lte('scheduled_for', now.toISOString())
    .order('scheduled_for', { ascending: true })
    .limit(limit)
  if (error) throw error

  const claimed: OutreachRun[] = []
  for (const run of due || []) {
    const summary = run.summary && typeof run.summary === 'object' && !Array.isArray(run.summary) ? run.summary : {}
    const { data, error: claimError } = await crm
      .from('outreach_runs')
      .update({
        status: 'preparing',
        started_at: now.toISOString(),
        // Drafts for this run are written by the scheduler, not the pop-up
        summary: { ...summary, auto_prepare: true },
      })
      .eq('id', run.id)
      .eq('status', 'scheduled')
      .select()
      .maybeSingle()
    if (claimError) throw claimError
    if (data) claimed.push(data)
  }
  return claimed
}

export async function insertRunEmails(crm: Crm, emails: OutreachEmailInsert[]): Promise<void> {
  if (emails.length === 0) return
  const { error } = await crm.from('outreach_emails').insert(emails)
  if (error) throw error
}

export async function finishRun(
  crm: Crm,
  runId: string,
  status: 'completed' | 'failed',
  summary: Record<string, Json>
): Promise<void> {
  const { error } = await crm
    .from('outreach_runs')
    .update({ status, finished_at: new Date().toISOString(), summary })
    .eq('id', runId)
  if (error) throw error
}

// Drafts still to write in runs the scheduler started
export async function fetchUndraftedEmailIds(crm: Crm, limit: number): Promise<string[]> {
  const { data: runs, error } = await crm
    .from('outreach_runs')
    .select('id')
    .in('status', ['preparing', 'awaiting_review'])
    .eq('summary->>auto_prepare', 'true')
  if (error) throw error
  if (!runs || runs.length === 0) return []

  const { data, error: emailsError } = await crm
    .from('outreach_emails')
    .select('id')
    .in('run_id', runs.map((r) => r.id))
    .eq('status', 'draft')
    .is('drafted_at', null)
    .order('created_at', { ascending: true })
    .limit(limit)
  if (emailsError) throw emailsError
  return (data || []).map((row) => row.id)
}

export type EmailToSync = Pick<
  OutreachEmail,
  | 'id'
  | 'lead_id'
  | 'run_id'
  | 'instantly_lead_id'
  | 'open_count'
  | 'opened_at'
  | 'replied_at'
  | 'reply_class'
  | 'bounced_at'
  | 'unsubscribed_at'
> & { lead: Pick<Lead, 'email' | 'company_name' | 'contact_name'> | null }

// Sent emails whose stats are older than staleBefore, oldest first
export async function fetchEmailsToSync(
  crm: Crm,
  staleBefore: Date,
  sentSince: Date,
  limit: number
): Promise<EmailToSync[]> {
  const { data, error } = await crm
    .from('outreach_emails')
    .select(
      'id, lead_id, run_id, instantly_lead_id, open_count, opened_at, replied_at, reply_class, bounced_at, unsubscribed_at, leads(email, company_name, contact_name)'
    )
    .eq('status', 'sent')
    .not('instantly_lead_id', 'is', null)
    .gte('sent_at', sentSince.toISOString())
    .or(`stats_synced_at.is.null,stats_synced_at.lt.${staleBefore.toISOString()}`)
    .order('stats_synced_at', { ascending: true, nullsFirst: true })
    .limit(limit)
  if (error) throw error
  return (data || []).map(({ leads, ...email }) => ({
    ...email,
    lead: leads as EmailToSync['lead'],
  }))
}

// Do-not-contact from now on; already listed is fine
export async function addSuppression(crm: Crm, email: string, reason: SuppressionReason): Promise<void> {
  const { error } = await crm.from('suppression_list').insert({ email: email.trim().toLowerCase(), reason })
  if (error && error.code !== '23505') throw error
}

export async function countSendsAndBounces(crm: Crm, since: Date): Promise<{ sent: number; bounced: number }> {
  const [sent, bounced] = await Promise.all([
    crm
      .from('outreach_emails')
      .select('id', { count: 'exact', head: true })
      .gte('sent_at', since.toISOString()),
    crm
      .from('outreach_emails')
      .select('id', { count: 'exact', head: true })
      .gte('sent_at', since.toISOString())
      .not('bounced_at', 'is', null),
  ])
  if (sent.error) throw sent.error
  if (bounced.error) throw bounced.error
  return { sent: sent.count ?? 0, bounced: bounced.count ?? 0 }
}

// The kill switch, flipped automatically; the reason shows in the send panel
export async function pauseSending(crm: Crm, reason: string): Promise<void> {
  const updatedAt = new Date().toISOString()
  const [paused, why] = await Promise.all([
    crm.from('outreach_settings').update({ value: true, updated_at: updatedAt }).eq('key', 'sending_paused'),
    crm.from('outreach_settings').update({ value: reason, updated_at: updatedAt }).eq('key', 'sending_paused_reason'),
  ])
  if (paused.error) throw paused.error
  if (why.error) throw why.error
}

