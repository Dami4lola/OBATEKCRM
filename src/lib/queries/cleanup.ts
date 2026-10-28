'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { parseOutreachSettings, type OutreachSettings } from '@/lib/outreach/settings'
import { scoreLead, type LeadScore } from '@/lib/outreach/scoring'
import { isSharedHost, phoneDigits, websiteHost } from '@/lib/outreach/sourcing'
import { hasOnlyGenericEmail, offeredByGenericRule } from '@/lib/outreach/cleanup'
import { estimateCompanySize, type CompanySize } from '@/lib/outreach/company-size'
import { parseAudit } from '@/lib/outreach/audit-findings'
import type { DismissedLeadInsert, Lead, Stage } from '@/types/database'

const PAGE_SIZE = 1000
const ID_CHUNK = 100

export interface CleanupRow {
  lead: Lead
  score: LeadScore
  // Every email we have is a shared inbox (info@, office@...)
  genericOnly: boolean
  size: CompanySize
  // Calls, meetings, sent emails or open tasks: never offered for deletion,
  // since deleting a lead deletes all of that with it
  hasHistory: boolean
}

export interface CleanupCandidates {
  stage: Stage
  settings: OutreachSettings
  // Checked leads below the score threshold, or large companies with only
  // a generic email and below generic_email_keep_score
  rows: CleanupRow[]
  uncheckedCount: number
}

type Supabase = ReturnType<typeof createClient>

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size))
  return chunks
}

async function leadIdsWithHistory(supabase: Supabase, leadIds: string[]): Promise<Set<string>> {
  const withHistory = new Set<string>()
  for (const ids of chunk(leadIds, ID_CHUNK)) {
    const [activities, meetings, tasks, emails] = await Promise.all([
      supabase.from('activities').select('lead_id').in('lead_id', ids),
      supabase.from('meetings').select('lead_id').in('lead_id', ids),
      supabase.from('tasks').select('lead_id').in('lead_id', ids).eq('status', 'pending'),
      supabase.from('outreach_emails').select('lead_id').in('lead_id', ids).not('sent_at', 'is', null),
    ])
    for (const result of [activities, meetings, tasks, emails]) {
      if (result.error) throw result.error
      for (const row of result.data || []) withHistory.add(row.lead_id)
    }
  }
  return withHistory
}

// Leads in the source stage that scored below the threshold after a site check
export function useCleanupCandidates(enabled: boolean) {
  const supabase = createClient()

  return useQuery({
    queryKey: ['outreach', 'cleanup'],
    enabled,
    queryFn: async (): Promise<CleanupCandidates> => {
      const { data: settingRows, error: settingsError } = await supabase
        .from('outreach_settings')
        .select('*')
      if (settingsError) throw settingsError
      const settings = parseOutreachSettings(settingRows || [])

      const { data: stage, error: stageError } = await supabase
        .from('stages')
        .select('*')
        .ilike('name', settings.source_stage_name)
        .limit(1)
        .maybeSingle()
      if (stageError) throw stageError
      if (!stage) throw new Error(`No pipeline stage named "${settings.source_stage_name}"`)

      const leads: Lead[] = []
      for (let from = 0; ; from += PAGE_SIZE) {
        const { data, error } = await supabase
          .from('leads')
          .select('*')
          .eq('stage_id', stage.id)
          .order('position_index', { ascending: true })
          .range(from, from + PAGE_SIZE - 1)
        if (error) throw error
        leads.push(...(data || []))
        if (!data || data.length < PAGE_SIZE) break
      }

      let uncheckedCount = 0
      const low: Omit<CleanupRow, 'hasHistory'>[] = []
      for (const lead of leads) {
        const score = scoreLead(lead, settings.score_weights, settings.target_verticals)
        // An unchecked lead's score isn't meaningful yet
        if (!score.painChecked) {
          uncheckedCount++
          continue
        }
        const genericOnly = hasOnlyGenericEmail(lead)
        const size = estimateCompanySize({
          staffSize: lead.staff_size,
          reviewCount: lead.google_review_count,
          signals: parseAudit(lead.audit)?.size_signals,
          smallMax: settings.small_business_max_staff,
        })
        const genericRule = offeredByGenericRule({
          genericOnly,
          size,
          score: score.score,
          keepScore: settings.generic_email_keep_score,
        })
        if (score.score < settings.score_threshold || genericRule) {
          low.push({ lead, score, genericOnly, size })
        }
      }

      const history = await leadIdsWithHistory(
        supabase,
        low.map((row) => row.lead.id)
      )
      const rows = low
        .map((row) => ({ ...row, hasHistory: history.has(row.lead.id) }))
        .sort((a, b) => a.score.score - b.score.score)

      return { stage, settings, rows, uncheckedCount }
    },
  })
}

interface DbError {
  code?: string
  message?: string
}

// Supabase errors are plain objects; turn them into a message Dami can act on
function cleanupError(error: DbError, step: 'remember' | 'delete'): Error {
  const missingTable =
    error.code === '42P01' ||
    error.code === 'PGRST205' ||
    /dismissed_leads/.test(error.message ?? '')
  if (step === 'remember' && missingTable) {
    return new Error('The dismissed_leads table is missing. Run 006_dismissed_leads.sql in Supabase, then try again.')
  }
  if (error.code === '42501') {
    return new Error('Permission denied. Check that 003_team_access.sql and 006_dismissed_leads.sql have been run and your account is in team_members.')
  }
  const what = step === 'remember' ? 'Could not save the deleted businesses' : 'Could not delete the leads'
  return new Error(`${what}: ${error.message ?? 'unknown error'}${error.code ? ` (${error.code})` : ''}`)
}

function dismissedRow(row: CleanupRow, userId: string | null): DismissedLeadInsert {
  const host = websiteHost(row.lead.website)
  return {
    google_place_id: row.lead.google_place_id,
    website_host: host && !isSharedHost(host) ? host : null,
    phone_digits: phoneDigits(row.lead.phone),
    company_name: row.lead.company_name || row.lead.contact_name,
    reason: `Score ${row.score.score}/${row.score.max}${row.genericOnly ? ', generic email only' : ''}`,
    dismissed_by: userId,
  }
}

// Remembers each business (so Find leads skips it), then deletes the leads
export function useDeleteLowValueLeads() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (rows: CleanupRow[]): Promise<number> => {
      const deletable = rows.filter((row) => !row.hasHistory)
      const {
        data: { user },
      } = await supabase.auth.getUser()

      for (const batch of chunk(deletable, ID_CHUNK)) {
        const dismissed = batch.map((row) => dismissedRow(row, user?.id ?? null))
        const { error } = await supabase.from('dismissed_leads').insert(dismissed)
        if (error?.code === '23505') {
          // A listing dismissed before: add the rest one by one
          for (const one of dismissed) {
            const { error: oneError } = await supabase.from('dismissed_leads').insert(one)
            if (oneError && oneError.code !== '23505') throw cleanupError(oneError, 'remember')
          }
        } else if (error) {
          throw cleanupError(error, 'remember')
        }

        const { error: deleteError } = await supabase
          .from('leads')
          .delete()
          .in('id', batch.map((row) => row.lead.id))
        if (deleteError) throw cleanupError(deleteError, 'delete')
      }

      return deletable.length
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] })
      queryClient.invalidateQueries({ queryKey: ['outreach'] })
      queryClient.invalidateQueries({ queryKey: ['calls'] })
    },
  })
}
