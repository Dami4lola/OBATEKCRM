'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { Stage } from '@/types/database'

export function useStages(pipelineId?: string) {
  const supabase = createClient()

  return useQuery({
    queryKey: ['stages', pipelineId],
    queryFn: async (): Promise<Stage[]> => {
      let query = supabase
        .from('stages')
        .select('*')
        .order('order_index', { ascending: true })

      if (pipelineId) {
        query = query.eq('pipeline_id', pipelineId)
      }

      const { data, error } = await query

      if (error) throw error
      return data || []
    },
  })
}
