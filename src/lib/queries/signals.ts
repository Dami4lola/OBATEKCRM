'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { PullSignalsResult } from '@/lib/outreach/signal-pull'
import type { LeadSignal } from '@/types/database'

const RECENT_DAYS = 7

// Job posts pulled in the last week, newest first, fit or not
export function useRecentSignals(enabled: boolean) {
  const supabase = createClient()

  return useQuery({
    queryKey: ['signals'],
    enabled,
    queryFn: async (): Promise<LeadSignal[]> => {
      const since = new Date(Date.now() - RECENT_DAYS * 86_400_000)
      const { data, error } = await supabase
        .from('lead_signals')
        .select('*')
        .gte('created_at', since.toISOString())
        .order('created_at', { ascending: false })
        .limit(300)
      if (error) throw error
      return data || []
    },
  })
}

export function useLeadSignals(leadId: string) {
  const supabase = createClient()

  return useQuery({
    queryKey: ['signals', 'lead', leadId],
    queryFn: async (): Promise<LeadSignal[]> => {
      const { data, error } = await supabase
        .from('lead_signals')
        .select('*')
        .eq('lead_id', leadId)
        .order('created_at', { ascending: false })
        .limit(10)
      if (error) throw error
      return data || []
    },
  })
}

export function usePullSignals() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (): Promise<PullSignalsResult> => {
      const response = await fetch('/api/outreach/signals/pull', { method: 'POST' })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.error || 'Failed to pull buying signals')
      return body as PullSignalsResult
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['signals'] })
      queryClient.invalidateQueries({ queryKey: ['leads'] })
      queryClient.invalidateQueries({ queryKey: ['outreach', 'settings'] })
    },
  })
}
