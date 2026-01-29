'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { Lead, LeadInsert, LeadUpdate } from '@/types/database'

export function useLeads() {
  const supabase = createClient()

  return useQuery({
    queryKey: ['leads'],
    queryFn: async (): Promise<Lead[]> => {
      const { data, error } = await supabase
        .from('leads')
        .select('*')
        .order('position_index', { ascending: true })

      if (error) throw error
      return data || []
    },
  })
}

export function useLeadsByStage(stageId: string) {
  const supabase = createClient()

  return useQuery({
    queryKey: ['leads', stageId],
    queryFn: async (): Promise<Lead[]> => {
      const { data, error } = await supabase
        .from('leads')
        .select('*')
        .eq('stage_id', stageId)
        .order('position_index', { ascending: true })

      if (error) throw error
      return data || []
    },
  })
}

export function useCreateLead() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (lead: LeadInsert): Promise<Lead> => {
      // Get the max position_index for the stage
      const { data: existingLeads } = await supabase
        .from('leads')
        .select('position_index')
        .eq('stage_id', lead.stage_id)
        .order('position_index', { ascending: false })
        .limit(1)

      const maxPosition = existingLeads?.[0]?.position_index ?? -1

      const { data, error } = await supabase
        .from('leads')
        .insert({
          ...lead,
          position_index: maxPosition + 1,
        })
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] })
    },
  })
}

export function useUpdateLead() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: string
      updates: LeadUpdate
    }): Promise<Lead> => {
      const { data, error } = await supabase
        .from('leads')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] })
    },
  })
}

export function useDeleteLead() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabase.from('leads').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] })
    },
  })
}

// Use the move_lead RPC function for atomic drag-drop reordering
// This handles all position shifting in a single database call
export function useMoveLead() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      leadId,
      newStageId,
      newPosition,
    }: {
      leadId: string
      newStageId: string
      newPosition: number
    }): Promise<void> => {
      const { error } = await supabase.rpc('move_lead', {
        p_lead_id: leadId,
        p_new_stage_id: newStageId,
        p_new_position: newPosition,
      })

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] })
    },
  })
}
