import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  ActivityInsert,
  CopyFeedbackInsert,
  Database,
  Lead,
  LeadInsert,
  LeadSignal,
  LeadSignalInsert,
  LeadSignalUpdate,
  LeadSource,
  LeadUpdate,
  Json,
  OutreachEmail,
  OutreachEmailInsert,
  OutreachEmailUpdate,
  OutreachMessage,
  OutreachMessageInsert,
  OutreachRun,
  Stage,
  SuppressionReason,
} from '@/types/database'
import { parseOutreachSettings, type OutreachSettings } from '../settings'
import { existingContactsFrom, websiteHost, type ExistingContacts } from '../sourcing'
import type { CopyExample } from '../copywriter'
import { parseSteps } from '../templates'
import type { SentEmail } from '../inbox-events'

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

export async function countLeadsSourcedSince(crm: Crm, since: Date, source: LeadSource = 'places'): Promise<number> {
  const { count, error } = await crm
    .from('leads')
    .select('id', { count: 'exact', head: true })
    .eq('lead_source', source)
    .gte('created_at', since.toISOString())
  if (error) throw error
  return count ?? 0
}

// Appends to the end of the stage, like the importer
export async function pushLeads(
  crm: Crm,
  stageId: string,
  leads: Omit<LeadInsert, 'stage_id' | 'position_index'>[]
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

// Emails sent since `since`, with the lead's address and the thread ids
// of every step, for matching what arrives in the mailbox
export async function fetchSentForMatching(crm: Crm, since: Date): Promise<SentEmail[]> {
  const sent: SentEmail[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await crm
      .from('outreach_emails')
      .select(
        'id, lead_id, run_id, sent_at, replied_at, reply_class, bounced_at, unsubscribed_at, sequence_state, next_step, next_step_at, leads(email, company_name, contact_name), outreach_messages(conversation_id)'
      )
      .eq('status', 'sent')
      .gte('sent_at', since.toISOString())
      .order('sent_at', { ascending: true })
      .range(from, from + PAGE_SIZE - 1)
    if (error) throw error
    for (const { leads, outreach_messages, ...email } of data || []) {
      const lead = leads as Pick<Lead, 'email' | 'company_name' | 'contact_name'> | null
      const messages = (outreach_messages ?? []) as { conversation_id: string | null }[]
      sent.push({
        ...email,
        leadEmail: lead?.email ?? null,
        company: lead?.company_name || lead?.contact_name || 'A lead',
        conversationIds: [...new Set(messages.map((m) => m.conversation_id).filter((id): id is string => !!id))],
      })
    }
    if (!data || data.length < PAGE_SIZE) break
  }
  return sent
}

// Inbox sync watermark (outreach_mailbox, through its gated function)
export async function setInboxCheckedAt(crm: Crm, at: Date): Promise<void> {
  const { error } = await crm.rpc('update_outreach_mailbox', { p_inbox_checked_at: at.toISOString() })
  if (error) throw error
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


// ---------- sending from the mailbox (§11) ----------

export interface EmailWithLead {
  email: OutreachEmail
  lead: Lead
}

function withLead(rows: (OutreachEmail & { leads: unknown })[] | null): EmailWithLead[] {
  return (rows || [])
    .filter((row) => row.leads)
    .map(({ leads, ...email }) => ({ email: email as OutreachEmail, lead: leads as Lead }))
}

// Approved emails waiting for the scheduler, oldest first
export async function fetchQueued(crm: Crm, limit: number): Promise<EmailWithLead[]> {
  const { data, error } = await crm
    .from('outreach_emails')
    .select('*, leads(*)')
    .eq('status', 'queued')
    .order('queued_at', { ascending: true })
    .limit(limit)
  if (error) throw error
  return withLead(data)
}

export async function fetchDueFollowUps(crm: Crm, now: Date, limit: number): Promise<EmailWithLead[]> {
  const { data, error } = await crm
    .from('outreach_emails')
    .select('*, leads(*)')
    .eq('sequence_state', 'active')
    .lte('next_step_at', now.toISOString())
    .order('next_step_at', { ascending: true })
    .limit(limit)
  if (error) throw error
  return withLead(data)
}

export async function fetchMessage(crm: Crm, emailId: string, step: number): Promise<OutreachMessage | null> {
  const { data, error } = await crm
    .from('outreach_messages')
    .select('*')
    .eq('email_id', emailId)
    .eq('step', step)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function insertOutreachMessage(crm: Crm, message: OutreachMessageInsert): Promise<void> {
  const { error } = await crm.from('outreach_messages').insert(message)
  // Already recorded (a retried tick): nothing to add
  if (error && error.code !== '23505') throw error
}

// Messages that count toward the daily cap: outreach and seed checks, not
// tests to yourself
export async function countMessagesSince(crm: Crm, since: Date): Promise<number> {
  const { count, error } = await crm
    .from('outreach_messages')
    .select('id', { count: 'exact', head: true })
    .in('kind', ['outreach', 'seed'])
    .gte('sent_at', since.toISOString())
  if (error) throw error
  return count ?? 0
}

export async function fetchSeedMessages(crm: Crm, limit: number): Promise<OutreachMessage[]> {
  const { data, error } = await crm
    .from('outreach_messages')
    .select('*')
    .eq('kind', 'seed')
    .order('sent_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return data || []
}

export async function setSetting(crm: Crm, key: string, value: Json): Promise<void> {
  const { error } = await crm
    .from('outreach_settings')
    .update({ value, updated_at: new Date().toISOString() })
    .eq('key', key)
  if (error) throw error
}

// ---------- Buying signals (017) ----------

// Posts already stored are skipped, so a post is never judged twice
export async function insertSignals(crm: Crm, rows: LeadSignalInsert[]): Promise<LeadSignal[]> {
  if (rows.length === 0) return []
  const { data, error } = await crm
    .from('lead_signals')
    .upsert(rows, { onConflict: 'source,external_id', ignoreDuplicates: true })
    .select()
  if (error) throw error
  return data || []
}

export async function fetchPendingSignals(crm: Crm, limit: number): Promise<LeadSignal[]> {
  const { data, error } = await crm
    .from('lead_signals')
    .select('*')
    .eq('fit', 'pending')
    .order('created_at', { ascending: true })
    .limit(limit)
  if (error) throw error
  return data || []
}

export async function updateSignal(crm: Crm, id: string, updates: LeadSignalUpdate): Promise<LeadSignal> {
  const { data, error } = await crm.from('lead_signals').update(updates).eq('id', id).select().single()
  if (error) throw error
  return data
}

// Companies seen lately: left out of the next search so their posts
// don't cost credits again
export async function fetchRecentSignalDomains(crm: Crm, since: Date, limit: number): Promise<string[]> {
  const { data, error } = await crm
    .from('lead_signals')
    .select('company_domain')
    .gte('created_at', since.toISOString())
    .not('company_domain', 'is', null)
    .order('created_at', { ascending: false })
    .limit(limit * 3)
  if (error) throw error
  const domains = new Set<string>()
  for (const row of data || []) {
    if (row.company_domain) domains.add(row.company_domain)
    if (domains.size >= limit) break
  }
  return [...domains]
}

// Posts returned since a moment: each one cost a credit
export async function countSignalsSince(crm: Crm, since: Date): Promise<number> {
  const { count, error } = await crm
    .from('lead_signals')
    .select('id', { count: 'exact', head: true })
    .eq('source', 'theirstack')
    .gte('created_at', since.toISOString())
  if (error) throw error
  return count ?? 0
}

// When the newest stored post was saved: the next search asks only for
// posts found after it
export async function fetchLatestSignalAt(crm: Crm): Promise<string | null> {
  const { data, error } = await crm
    .from('lead_signals')
    .select('created_at')
    .eq('source', 'theirstack')
    .order('created_at', { ascending: false })
    .limit(1)
  if (error) throw error
  return data?.[0]?.created_at ?? null
}

// A lead with this company name in this state or province, for posts with
// no website to match on
export async function findLeadIdByName(crm: Crm, name: string, region: string | null): Promise<string | null> {
  let query = crm.from('leads').select('id').ilike('company_name', name.replace(/[\\%_]/g, (c) => `\\${c}`))
  if (region) query = query.ilike('region', region)
  const { data, error } = await query.limit(1)
  if (error) throw error
  return data?.[0]?.id ?? null
}

// The lead whose website is on this host, if any
export async function findLeadIdByHost(crm: Crm, host: string): Promise<string | null> {
  const pattern = `%${host.replace(/[\\%_]/g, (c) => `\\${c}`)}%`
  const { data, error } = await crm.from('leads').select('id, website').ilike('website', pattern).limit(20)
  if (error) throw error
  return (data || []).find((row) => websiteHost(row.website) === host)?.id ?? null
}

export async function fetchSignalsForLead(crm: Crm, leadId: string, limit = 10): Promise<LeadSignal[]> {
  const { data, error } = await crm
    .from('lead_signals')
    .select('*')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return data || []
}

// Fit posts linked to a lead since a moment, newest first
export async function fetchRecentFitSignals(crm: Crm, since: Date): Promise<LeadSignal[]> {
  const { data, error } = await crm
    .from('lead_signals')
    .select('*')
    .eq('fit', 'fit')
    .in('status', ['lead_created', 'matched_existing'])
    .not('lead_id', 'is', null)
    .gte('created_at', since.toISOString())
    .order('created_at', { ascending: false })
    .limit(500)
  if (error) throw error
  return data || []
}

export async function fetchLeadsByIds(crm: Crm, ids: string[]): Promise<Lead[]> {
  const leads: Lead[] = []
  for (const part of chunk(ids, 200)) {
    const { data, error } = await crm.from('leads').select('*').in('id', part)
    if (error) throw error
    leads.push(...(data || []))
  }
  return leads
}

// Leads that already have an email in some run since a moment: a signal
// lead goes into one run, not one a day
export async function fetchLeadIdsWithEmailsSince(crm: Crm, leadIds: string[], since: Date): Promise<Set<string>> {
  const found = new Set<string>()
  for (const part of chunk(leadIds, 200)) {
    const { data, error } = await crm
      .from('outreach_emails')
      .select('lead_id')
      .in('lead_id', part)
      .gte('created_at', since.toISOString())
    if (error) throw error
    for (const row of data || []) found.add(row.lead_id)
  }
  return found
}

// Today's Buying signals run, still open for review, or a new one. Its
// drafts are written by the tick like a scheduled run's.
export async function getOrCreateSignalRun(crm: Crm, day: string, now: Date): Promise<OutreachRun> {
  const { data: open, error } = await crm
    .from('outreach_runs')
    .select('*')
    .in('status', ['preparing', 'awaiting_review'])
    .eq('summary->>kind', 'signals')
    .eq('summary->>day', day)
    .limit(1)
  if (error) throw error
  if (open && open[0]) return open[0]

  const { data, error: insertError } = await crm
    .from('outreach_runs')
    .insert({
      status: 'preparing',
      mode: 'manual',
      scheduled_for: now.toISOString(),
      started_at: now.toISOString(),
      summary: { kind: 'signals', day, auto_prepare: true },
    })
    .select()
    .single()
  if (insertError) throw insertError
  return data
}

// Leads with an email still on its way (draft, approved or queued) in any run
export async function fetchLeadIdsInOpenEmails(crm: Crm, leadIds: string[]): Promise<Set<string>> {
  const found = new Set<string>()
  for (const part of chunk(leadIds, 200)) {
    const { data, error } = await crm
      .from('outreach_emails')
      .select('lead_id')
      .in('lead_id', part)
      .in('status', ['draft', 'approved', 'queued'])
    if (error) throw error
    for (const row of data || []) found.add(row.lead_id)
  }
  return found
}

// ---------- Other lead sources (019) ----------

// Licence and filing refs already imported, and every lead's company name
// in its state, so a brokerage found on Google Maps first isn't added again
export async function fetchImportedKeys(
  crm: Crm
): Promise<{ sourceRefs: Set<string>; companies: { name: string | null; region: string | null }[] }> {
  const sourceRefs = new Set<string>()
  const companies: { name: string | null; region: string | null }[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await crm
      .from('leads')
      .select('source_ref, company_name, region')
      .range(from, from + PAGE_SIZE - 1)
    if (error) throw error
    for (const row of data || []) {
      if (row.source_ref) sourceRefs.add(row.source_ref)
      companies.push({ name: row.company_name, region: row.region })
    }
    if (!data || data.length < PAGE_SIZE) break
  }
  return { sourceRefs, companies }
}
