'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { approvedAuthor, parseSteps, type PrepareEmailResult } from '@/lib/outreach/templates'
import type { SendEmailResult } from '@/lib/outreach/sending'
import type { CopyFeedback, Json, Lead, OutreachEmail, OutreachEmailStep } from '@/types/database'

export interface RunEmail {
  email: OutreachEmail
  lead: Lead
}

// Every email in a run except leads that were blocked when it was created
export function useRunEmails(runId: string | null) {
  const supabase = createClient()

  return useQuery({
    queryKey: ['outreach', 'run-emails', runId],
    enabled: !!runId,
    queryFn: async (): Promise<RunEmail[]> => {
      const { data, error } = await supabase
        .from('outreach_emails')
        .select('*, leads(*)')
        .eq('run_id', runId!)
        .in('status', ['draft', 'approved', 'skipped', 'sent', 'failed', 'blocked'])
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data || [])
        // Blocked at send time (after drafting) is shown; blocked up front isn't
        .filter((row) => row.leads && (row.status !== 'blocked' || row.drafted_at))
        .map(({ leads, ...email }) => ({ email: email as OutreachEmail, lead: leads as Lead }))
    },
  })
}

export interface DraftFeedback {
  note: string
  remember: boolean
  onlyVertical: boolean
  subject?: string
  opener?: string
}

export async function requestPrepare(emailId: string, feedback?: DraftFeedback): Promise<PrepareEmailResult> {
  const response = await fetch('/api/outreach/prepare', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ emailId, feedback }),
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.error || 'Failed to draft the email')
  return body as PrepareEmailResult
}

export function useReviewEmail() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      email,
      action,
      steps,
      opener,
    }: {
      email: OutreachEmail
      action: 'approve' | 'skip' | 'reopen'
      steps?: OutreachEmailStep[]
      opener?: string
    }): Promise<OutreachEmail> => {
      const updates =
        action === 'approve'
          ? {
              status: 'approved' as const,
              approved_at: new Date().toISOString(),
              steps: steps as unknown as Json,
              opener: opener?.trim() || null,
              author: approvedAuthor(steps ?? [], parseSteps(email.draft_steps)),
            }
          : action === 'skip'
            ? { status: 'skipped' as const, approved_at: null }
            : { status: 'draft' as const, approved_at: null }

      const { data, error } = await supabase
        .from('outreach_emails')
        .update(updates)
        .eq('id', email.id)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['outreach'] })
    },
  })
}

export async function requestSend(emailId: string): Promise<SendEmailResult> {
  const response = await fetch('/api/outreach/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ emailId }),
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.error || 'Failed to send')
  return body as SendEmailResult
}

export interface RunSummary {
  sent: number
  failed: number
  blocked: number
}

// Marks the run finished once nothing is left to send
export function useCompleteRun() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ runId, summary }: { runId: string; summary: RunSummary }) => {
      const { error } = await supabase
        .from('outreach_runs')
        .update({
          status: 'completed',
          finished_at: new Date().toISOString(),
          summary: summary as unknown as Json,
        })
        .eq('id', runId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['outreach'] })
      queryClient.invalidateQueries({ queryKey: ['leads'] })
    },
  })
}

// Writing rules every Claude draft follows (copy_feedback, active)
export function useCopyRules() {
  const supabase = createClient()

  return useQuery({
    queryKey: ['outreach', 'copy-rules'],
    queryFn: async (): Promise<CopyFeedback[]> => {
      const { data, error } = await supabase
        .from('copy_feedback')
        .select('*')
        .eq('active', true)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data || []
    },
  })
}

export function useAddCopyRule() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (note: string) => {
      const { error } = await supabase.from('copy_feedback').insert({ note: note.trim(), active: true })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['outreach', 'copy-rules'] })
    },
  })
}

// Turned off rather than deleted, so the feedback history stays
export function useRemoveCopyRule() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('copy_feedback').update({ active: false }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['outreach', 'copy-rules'] })
    },
  })
}
