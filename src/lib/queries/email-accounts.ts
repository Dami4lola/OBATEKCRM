'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { EmailAccount } from '@/types/database'

// Only select non-sensitive fields for the UI
type EmailAccountPublic = Pick<
  EmailAccount,
  'id' | 'provider' | 'email_address' | 'created_at'
>

export function useEmailAccounts() {
  const supabase = createClient()

  return useQuery({
    queryKey: ['email-accounts'],
    queryFn: async (): Promise<EmailAccountPublic[]> => {
      const { data, error } = await supabase
        .from('email_accounts')
        .select('id, provider, email_address, created_at')
        .order('created_at', { ascending: false })

      if (error) throw error
      return data || []
    },
  })
}

export function useDeleteEmailAccount() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabase.from('email_accounts').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email-accounts'] })
    },
  })
}

export function useSendEmail() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: {
      emailAccountId: string
      leadId: string
      to: string
      subject: string
      body: string
    }) => {
      const response = await fetch('/api/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || 'Failed to send email')
      }

      return response.json()
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['email-logs', variables.leadId] })
    },
  })
}

export function useEmailLogs(leadId: string) {
  const supabase = createClient()

  return useQuery({
    queryKey: ['email-logs', leadId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('email_logs')
        .select('*, email_accounts(email_address, provider)')
        .eq('lead_id', leadId)
        .order('sent_at', { ascending: false })

      if (error) throw error
      return data || []
    },
    enabled: !!leadId,
  })
}
