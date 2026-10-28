import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  Database,
  Lead,
  LeadUpdate,
  OutreachEmail,
  OutreachEmailUpdate,
  Stage,
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

// A run moves to review once its first draft exists
export async function markRunAwaitingReview(crm: Crm, runId: string): Promise<void> {
  const { error } = await crm
    .from('outreach_runs')
    .update({ status: 'awaiting_review' })
    .eq('id', runId)
    .eq('status', 'preparing')
  if (error) throw error
}
