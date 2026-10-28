'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import {
  parseOutreachSettings,
  type OutreachSettings,
} from '@/lib/outreach/settings'
import {
  blockedReason,
  checkLeads,
  type GatherWarning,
} from '@/lib/outreach/compliance'
import { scoreLead, type LeadScore } from '@/lib/outreach/scoring'
import type {
  Lead,
  OutreachEmailInsert,
  OutreachMode,
  OutreachRun,
  OutreachRunStatus,
  Stage,
} from '@/types/database'
import type { SourceLeadsResult } from '@/lib/outreach/sourcing'
import type { AuditLeadResult } from '@/lib/outreach/audit-findings'

export const ACTIVE_RUN_STATUSES: OutreachRunStatus[] = [
  'scheduled',
  'preparing',
  'awaiting_review',
  'sending',
]

export interface GatherRow {
  lead: Lead
  warnings: GatherWarning[]
  blocked: boolean
  score: LeadScore
  // Starts unticked; can still be ticked by hand
  belowThreshold: boolean
}

export interface GatherResult {
  stage: Stage
  rows: GatherRow[]
  settings: OutreachSettings
}

type Supabase = ReturnType<typeof createClient>

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size))
  }
  return chunks
}

async function fetchSettings(supabase: Supabase): Promise<OutreachSettings> {
  const { data, error } = await supabase.from('outreach_settings').select('*')
  if (error) throw error
  return parseOutreachSettings(data || [])
}

// Supabase caps a select at 1000 rows, so page through the whole list
async function fetchSuppressions(supabase: Supabase) {
  const emails = new Set<string>()
  const domains = new Set<string>()
  const pageSize = 1000

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('suppression_list')
      .select('email, domain')
      .range(from, from + pageSize - 1)

    if (error) throw error
    for (const row of data || []) {
      if (row.email) emails.add(row.email.toLowerCase())
      if (row.domain) domains.add(row.domain.toLowerCase())
    }
    if (!data || data.length < pageSize) break
  }

  return { emails, domains }
}

async function fetchLastSentAt(supabase: Supabase, leadIds: string[]) {
  const lastSentAt = new Map<string, Date>()

  // Keep each IN list short enough for the request URL
  for (const ids of chunk(leadIds, 100)) {
    const { data, error } = await supabase
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

export function useOutreachSettings() {
  const supabase = createClient()

  return useQuery({
    queryKey: ['outreach', 'settings'],
    queryFn: () => fetchSettings(supabase),
  })
}

// Every lead in the source stage, with compliance warnings for this run
export function useOutreachGather(enabled: boolean) {
  const supabase = createClient()

  return useQuery({
    queryKey: ['outreach', 'gather'],
    enabled,
    queryFn: async (): Promise<GatherResult> => {
      const settings = await fetchSettings(supabase)

      const { data: stage, error: stageError } = await supabase
        .from('stages')
        .select('*')
        .ilike('name', settings.source_stage_name)
        .limit(1)
        .maybeSingle()

      if (stageError) throw stageError
      if (!stage) {
        throw new Error(
          `No pipeline stage named "${settings.source_stage_name}". Rename a stage or change source_stage_name in outreach settings.`
        )
      }

      const { data: leads, error: leadsError } = await supabase
        .from('leads')
        .select('*')
        .eq('stage_id', stage.id)
        .order('position_index', { ascending: true })

      if (leadsError) throw leadsError

      const [suppressions, lastSentAt] = await Promise.all([
        fetchSuppressions(supabase),
        fetchLastSentAt(supabase, (leads || []).map((l) => l.id)),
      ])

      const warnings = checkLeads(leads || [], {
        suppressedEmails: suppressions.emails,
        suppressedDomains: suppressions.domains,
        lastSentAt,
        cooldownDays: settings.resequence_cooldown_days,
        now: new Date(),
      })

      const rows = (leads || []).map((lead) => {
        const leadWarnings = warnings.get(lead.id) || []
        const score = scoreLead(lead, settings.score_weights, settings.target_verticals)
        // Only judge leads that have been checked for pain signals
        const belowThreshold = score.painChecked && score.score < settings.score_threshold
        if (belowThreshold) {
          leadWarnings.push({
            code: 'low_score',
            message: `Score ${score.score}, below ${settings.score_threshold}`,
            blocking: false,
          })
        }
        return {
          lead,
          warnings: leadWarnings,
          blocked: leadWarnings.some((w) => w.blocking),
          score,
          belowThreshold,
        }
      })

      return { stage, rows, settings }
    },
  })
}

export function useActiveOutreachRuns() {
  const supabase = createClient()

  return useQuery({
    queryKey: ['outreach', 'runs', 'active'],
    queryFn: async (): Promise<OutreachRun[]> => {
      const { data, error } = await supabase
        .from('outreach_runs')
        .select('*')
        .in('status', ACTIVE_RUN_STATUSES)
        .order('scheduled_for', { ascending: true })

      if (error) throw error
      return data || []
    },
  })
}

// Run now: the run starts preparing and gets a draft row per selected lead
// (blocked leads are recorded too). Scheduled: only the run is saved; it
// re-gathers when it fires and skips the leads that were unticked here.
export function useCreateOutreachRun() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      rows,
      selectedIds,
      scheduledFor,
      mode,
    }: {
      rows: GatherRow[]
      selectedIds: Set<string>
      scheduledFor: Date | null
      mode: OutreachMode
    }): Promise<OutreachRun> => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      const now = new Date().toISOString()

      if (scheduledFor) {
        const excluded = rows
          .filter((row) => !row.blocked && !selectedIds.has(row.lead.id))
          .map((row) => row.lead.id)

        const { data, error } = await supabase
          .from('outreach_runs')
          .insert({
            status: 'scheduled',
            mode,
            scheduled_for: scheduledFor.toISOString(),
            created_by: user?.id ?? null,
            summary: { excluded_lead_ids: excluded },
          })
          .select()
          .single()

        if (error) throw error
        return data
      }

      const { data: run, error: runError } = await supabase
        .from('outreach_runs')
        .insert({
          status: 'preparing',
          mode,
          scheduled_for: now,
          started_at: now,
          created_by: user?.id ?? null,
        })
        .select()
        .single()

      if (runError) throw runError

      const emails: OutreachEmailInsert[] = rows
        .filter((row) => row.blocked || selectedIds.has(row.lead.id))
        .map((row) => ({
          lead_id: row.lead.id,
          run_id: run.id,
          status: row.blocked ? 'blocked' : 'draft',
          blocked_reason: row.blocked ? blockedReason(row.warnings) : null,
        }))

      if (emails.length > 0) {
        const { error: emailsError } = await supabase
          .from('outreach_emails')
          .insert(emails)

        if (emailsError) {
          // Don't leave a run behind with no leads attached
          await supabase.from('outreach_runs').delete().eq('id', run.id)
          throw emailsError
        }
      }

      return run
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['outreach'] })
    },
  })
}

export function useCancelOutreachRun() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabase
        .from('outreach_runs')
        .update({ status: 'cancelled', finished_at: new Date().toISOString() })
        .eq('id', id)

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['outreach'] })
    },
  })
}

export interface SourceLeadsInput {
  query: string
  vertical: string
  city: string
  region?: string
  country: string
  maxResults: number
}

// Runs on the server (/api/outreach/source): Places search, dedupe, insert
export function useSourceLeads() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: SourceLeadsInput): Promise<SourceLeadsResult> => {
      const response = await fetch('/api/outreach/source', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.error || 'Failed to find leads')
      return body as SourceLeadsResult
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] })
      queryClient.invalidateQueries({ queryKey: ['outreach'] })
    },
  })
}

export async function requestLeadAudit(input: {
  leadId: string
  checkReviews: boolean
  lookupListing: boolean
  force?: boolean
}): Promise<AuditLeadResult> {
  const response = await fetch('/api/outreach/audit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.error || 'Failed to check the site')
  return body as AuditLeadResult
}

// Re-check one lead from the lead sheet
export function useAuditLead() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: { leadId: string; checkReviews: boolean }) =>
      requestLeadAudit({ ...input, lookupListing: true, force: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] })
      queryClient.invalidateQueries({ queryKey: ['outreach'] })
      queryClient.invalidateQueries({ queryKey: ['calls'] })
    },
  })
}

// Never checked, checked too long ago, or no website and checked before the
// Google lookup existed (so "no website" was never confirmed)
function needsSiteCheck(lead: Lead, staleBefore: Date): boolean {
  if (!lead.audited_at || new Date(lead.audited_at) < staleBefore) return true
  const raw = lead.audit as Record<string, unknown> | null
  return !lead.website && !lead.google_place_id && !raw?.website_status
}

// Leads in the source stage that need a site check
export function useLeadsToCheck(enabled: boolean) {
  const supabase = createClient()

  return useQuery({
    queryKey: ['outreach', 'to-check'],
    enabled,
    queryFn: async () => {
      const settings = await fetchSettings(supabase)
      const { data: stage, error: stageError } = await supabase
        .from('stages')
        .select('*')
        .ilike('name', settings.source_stage_name)
        .limit(1)
        .maybeSingle()
      if (stageError) throw stageError
      if (!stage) throw new Error(`No pipeline stage named "${settings.source_stage_name}"`)

      const staleBefore = new Date(Date.now() - settings.audit_max_age_days * 86_400_000)
      const leads: Lead[] = []
      const pageSize = 1000
      for (let from = 0; ; from += pageSize) {
        const { data, error } = await supabase
          .from('leads')
          .select('*')
          .eq('stage_id', stage.id)
          .order('position_index', { ascending: true })
          .range(from, from + pageSize - 1)
        if (error) throw error
        leads.push(...(data || []).filter((lead) => needsSiteCheck(lead, staleBefore)))
        if (!data || data.length < pageSize) break
      }

      return { stage, leads, settings }
    },
  })
}
