'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { createClient } from '@/lib/supabase/client'
import { parseOutreachSettings, type OutreachSettings } from '@/lib/outreach/settings'
import { scoreLead, type LeadScore } from '@/lib/outreach/scoring'
import { buildCallBrief, callTaskTitle, CALL_OUTCOMES, type CallOutcome } from '@/lib/outreach/call-brief'
import type { Lead, Task } from '@/types/database'

// How many ranked leads the picker shows
const CANDIDATE_LIMIT = 15

export interface CallCandidate {
  lead: Lead
  score: LeadScore
}

export interface CallTask {
  task: Task
  lead: Lead
}

export interface CallList {
  settings: OutreachSettings
  today: CallTask[]
  candidates: CallCandidate[]
}

function todayDate() {
  return format(new Date(), 'yyyy-MM-dd')
}

// Open call tasks due today or earlier, plus the best-scored leads with a
// phone in New or Contacted that don't already have one
export function useCallList(enabled: boolean) {
  const supabase = createClient()

  return useQuery({
    queryKey: ['calls'],
    enabled,
    queryFn: async (): Promise<CallList> => {
      const { data: settingRows, error: settingsError } = await supabase
        .from('outreach_settings')
        .select('*')
      if (settingsError) throw settingsError
      const settings = parseOutreachSettings(settingRows || [])

      const { data: stages, error: stagesError } = await supabase
        .from('stages')
        .select('id, name')
      if (stagesError) throw stagesError
      const callableNames = [settings.source_stage_name, settings.target_stage_name].map((n) =>
        n.toLowerCase()
      )
      const stageIds = (stages || [])
        .filter((stage) => callableNames.includes(stage.name.toLowerCase()))
        .map((stage) => stage.id)

      const { data: tasks, error: tasksError } = await supabase
        .from('tasks')
        .select('*, leads(*)')
        .eq('kind', 'call')
        .eq('status', 'pending')
        .order('due_date', { ascending: true })
      if (tasksError) throw tasksError

      const openCallLeadIds = new Set((tasks || []).map((task) => task.lead_id))
      const today = (tasks || [])
        .filter((task) => task.due_date <= todayDate() && task.leads)
        .map(({ leads, ...task }) => ({ task, lead: leads as Lead }))

      let candidates: CallCandidate[] = []
      if (stageIds.length > 0) {
        const { data: leads, error: leadsError } = await supabase
          .from('leads')
          .select('*')
          .in('stage_id', stageIds)
          .not('phone', 'is', null)
        if (leadsError) throw leadsError

        candidates = (leads || [])
          .filter((lead) => lead.phone?.trim() && !openCallLeadIds.has(lead.id))
          .map((lead) => ({
            lead,
            score: scoreLead(lead, settings.score_weights, settings.target_verticals),
          }))
          .sort(
            (a, b) =>
              b.score.score - a.score.score ||
              a.lead.created_at.localeCompare(b.lead.created_at)
          )
          .slice(0, CANDIDATE_LIMIT)
      }

      return { settings, today, candidates }
    },
  })
}

export function useAddCallTasks() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (candidates: CallCandidate[]): Promise<void> => {
      const due = todayDate()
      const { error } = await supabase.from('tasks').insert(
        candidates.map(({ lead, score }) => ({
          lead_id: lead.id,
          kind: 'call' as const,
          title: callTaskTitle(lead),
          description: buildCallBrief(lead, score),
          due_date: due,
        }))
      )
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calls'] })
    },
  })
}

// Closes the task and logs the call on the lead's timeline
export function useLogCall() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      task,
      outcome,
      notes,
    }: {
      task: Task
      outcome: CallOutcome
      notes: string
    }): Promise<void> => {
      const label = CALL_OUTCOMES.find((o) => o.value === outcome)?.label ?? outcome

      const { error: activityError } = await supabase.from('activities').insert({
        lead_id: task.lead_id,
        type: 'call',
        title: `Call: ${label}`,
        description: notes.trim() || null,
        meta: { outcome, task_id: task.id, channel: 'call' },
      })
      if (activityError) throw activityError

      const { error: taskError } = await supabase
        .from('tasks')
        .update({ status: 'completed', completed_at: new Date().toISOString() })
        .eq('id', task.id)
      if (taskError) throw taskError
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calls'] })
    },
  })
}
