'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { approvedAuthor, parseSteps, type PrepareEmailResult } from '@/lib/outreach/templates'
import type { SendEmailResult } from '@/lib/outreach/sending'
import type { SyncResult } from '@/lib/outreach/inbox-sync'
import type {
  CopyFeedback,
  Json,
  Lead,
  MailboxStatus,
  OutreachEmail,
  OutreachEmailStatus,
  OutreachEmailStep,
  OutreachMessage,
  SeedPlacement,
} from '@/types/database'

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
        .in('status', ['draft', 'approved', 'queued', 'skipped', 'sent', 'failed', 'blocked'])
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
            : { status: 'draft' as const, approved_at: null, queued_at: null }

      // Never reopen an email the scheduler has already sent
      const from: OutreachEmailStatus[] = action === 'reopen' ? ['approved', 'queued', 'skipped', 'failed'] : ['draft']
      const { data, error } = await supabase
        .from('outreach_emails')
        .update(updates)
        .eq('id', email.id)
        .in('status', from)
        .select()
        .maybeSingle()
      if (error) throw error
      if (!data) throw new Error('This email changed (it may have just been sent). Refresh to see it.')
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['outreach'] })
    },
  })
}

// Queues one approved email; the scheduler sends it from the mailbox
export async function requestSend(emailId: string): Promise<SendEmailResult> {
  const response = await fetch('/api/outreach/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ emailId }),
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.error || 'Failed to queue')
  return body as SendEmailResult
}

// Email 1, footer included, to the connected mailbox itself
export async function requestTestSend(emailId: string): Promise<{ sentTo: string }> {
  const response = await fetch('/api/outreach/send/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ emailId }),
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.error || 'Failed to send the test')
  return body as { sentTo: string }
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

export interface RecentReply {
  email: Pick<OutreachEmail, 'id' | 'lead_id' | 'replied_at' | 'reply_class' | 'unsubscribed_at'>
  company: string
  address: string | null
}

const RECENT_REPLY_DAYS = 14

// Replies to outreach emails in the last two weeks, newest first
export function useRecentReplies() {
  const supabase = createClient()

  return useQuery({
    queryKey: ['outreach', 'recent-replies'],
    queryFn: async (): Promise<RecentReply[]> => {
      const since = new Date(Date.now() - RECENT_REPLY_DAYS * 86_400_000).toISOString()
      const { data, error } = await supabase
        .from('outreach_emails')
        .select('id, lead_id, replied_at, reply_class, unsubscribed_at, leads(company_name, contact_name, email)')
        .gte('replied_at', since)
        .order('replied_at', { ascending: false })
        .limit(20)
      if (error) throw error
      return (data || []).map(({ leads, ...email }) => {
        const lead = leads as Pick<Lead, 'company_name' | 'contact_name' | 'email'> | null
        return { email, company: lead?.company_name || lead?.contact_name || 'A lead', address: lead?.email ?? null }
      })
    },
  })
}

export async function requestStatsSync(): Promise<SyncResult> {
  const response = await fetch('/api/outreach/stats/sync', { method: 'POST' })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.error || 'Failed to read the mailbox')
  return body as SyncResult
}

export interface MailboxStatusRow {
  address: string
  status: MailboxStatus
  connected_at: string
  inbox_checked_at: string | null
}

// The connected sending mailbox, or null. Never includes the token.
export function useMailboxStatus() {
  const supabase = createClient()

  return useQuery({
    queryKey: ['outreach', 'mailbox'],
    queryFn: async (): Promise<MailboxStatusRow | null> => {
      const { data, error } = await supabase.rpc('outreach_mailbox_status')
      if (error) throw error
      return data?.[0] ?? null
    },
  })
}

export function useDisconnectMailbox() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('disconnect_outreach_mailbox')
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['outreach', 'mailbox'] })
    },
  })
}

// An opt-out the inbox sync didn't catch: never email this address again,
// and stop the sequence if it's still running
export function useAddToDoNotContact() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ emailId, address }: { emailId: string; address: string }) => {
      const { error } = await supabase
        .from('suppression_list')
        .insert({ email: address.trim().toLowerCase(), reason: 'manual' })
      // Already listed is fine
      if (error && error.code !== '23505') throw error
      const { error: stopError } = await supabase
        .from('outreach_emails')
        .update({
          unsubscribed_at: new Date().toISOString(),
          sequence_state: 'stopped',
          next_step: null,
          next_step_at: null,
          stopped_reason: 'Added to do-not-contact by hand',
        })
        .eq('id', emailId)
        .is('unsubscribed_at', null)
      if (stopError) throw stopError
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['outreach'] })
    },
  })
}

const SEED_CHECK_DAYS = 7

// Seed-inbox copies from the last week still to be marked
export function useSeedChecks() {
  const supabase = createClient()

  return useQuery({
    queryKey: ['outreach', 'seed-checks'],
    queryFn: async (): Promise<OutreachMessage[]> => {
      const since = new Date(Date.now() - SEED_CHECK_DAYS * 86_400_000).toISOString()
      const { data, error } = await supabase
        .from('outreach_messages')
        .select('*')
        .eq('kind', 'seed')
        .is('placement', null)
        .gte('sent_at', since)
        .order('sent_at', { ascending: false })
      if (error) throw error
      return data || []
    },
  })
}

// Spam holds the warm-up ramp a step back until a later check lands well
export function useMarkPlacement() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, placement }: { id: string; placement: SeedPlacement }) => {
      const { error } = await supabase
        .from('outreach_messages')
        .update({ placement, placement_checked_at: new Date().toISOString() })
        .eq('id', id)
        .eq('kind', 'seed')
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['outreach', 'seed-checks'] })
    },
  })
}
