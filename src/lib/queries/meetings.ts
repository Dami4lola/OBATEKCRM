'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type {
  Meeting,
  MeetingInsert,
  MeetingUpdate,
  MeetingWithLead,
} from '@/types/database'

const MEETING_SELECT = '*, leads(id, contact_name, company_name, stage_id)'

export function useMeetings() {
  const supabase = createClient()

  return useQuery({
    queryKey: ['meetings'],
    queryFn: async (): Promise<MeetingWithLead[]> => {
      const { data, error } = await supabase
        .from('meetings')
        .select(MEETING_SELECT)
        .order('meeting_date', { ascending: false })

      if (error) throw error
      return (data as MeetingWithLead[]) || []
    },
  })
}

export function useLeadMeetings(leadId: string | undefined) {
  const supabase = createClient()

  return useQuery({
    queryKey: ['meetings', leadId],
    queryFn: async (): Promise<Meeting[]> => {
      const { data, error } = await supabase
        .from('meetings')
        .select('*')
        .eq('lead_id', leadId!)
        .order('meeting_date', { ascending: false })

      if (error) throw error
      return data || []
    },
    enabled: !!leadId,
  })
}

export function useCreateMeeting() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (meeting: MeetingInsert): Promise<Meeting> => {
      const { data, error } = await supabase
        .from('meetings')
        .insert(meeting)
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meetings'] })
    },
  })
}

export function useUpdateMeeting() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: string
      updates: MeetingUpdate
    }): Promise<Meeting> => {
      const { data, error } = await supabase
        .from('meetings')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meetings'] })
    },
  })
}

export function useDeleteMeeting() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabase.from('meetings').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meetings'] })
    },
  })
}
