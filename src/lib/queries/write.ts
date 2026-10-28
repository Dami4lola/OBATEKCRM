'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { approvedAuthor, parseSteps, type PrepareEmailResult } from '@/lib/outreach/templates'
import type { Json, Lead, OutreachEmail, OutreachEmailStep } from '@/types/database'

export interface RunEmail {
  email: OutreachEmail
  lead: Lead
}

// Drafts, approved and skipped emails in one run (blocked ones aren't shown)
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
        .in('status', ['draft', 'approved', 'skipped'])
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data || [])
        .filter((row) => row.leads)
        .map(({ leads, ...email }) => ({ email: email as OutreachEmail, lead: leads as Lead }))
    },
  })
}

export async function requestPrepare(emailId: string): Promise<PrepareEmailResult> {
  const response = await fetch('/api/outreach/prepare', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ emailId }),
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
