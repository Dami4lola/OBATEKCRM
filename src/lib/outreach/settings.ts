import type { OutreachMode, OutreachSetting } from '@/types/database'

export interface OutreachSettings {
  source_stage_name: string
  target_stage_name: string
  mode: OutreachMode
  sending_paused: boolean
  daily_send_cap: number
  send_window: { start: string; end: string; weekdays_only: boolean }
  resequence_cooldown_days: number
  auto_unlock_min_sends: number
  auto_unlock_open_rate: number
  example_min_sends: number
  example_max_in_prompt: number
  instantly_campaigns: Record<string, string>
  offer_description: string
  score_weights: ScoreWeights
  score_threshold: number
  target_verticals: string[]
  call_list_size: number
  auto_unlock_min_days: number
  places_max_results: number
  places_daily_lead_cap: number
}

export interface ScoreWeights {
  pain_signal: number
  staff_size: number
  owner_reachable: number
  target_vertical: number
}

// Mirrors the seed rows in supabase/migrations/002_outreach.sql and 004_sourcing.sql
export const DEFAULT_OUTREACH_SETTINGS: OutreachSettings = {
  source_stage_name: 'New',
  target_stage_name: 'Contacted',
  mode: 'manual',
  sending_paused: true,
  daily_send_cap: 20,
  send_window: { start: '08:30', end: '16:30', weekdays_only: true },
  resequence_cooldown_days: 180,
  auto_unlock_min_sends: 50,
  auto_unlock_open_rate: 0.5,
  example_min_sends: 10,
  example_max_in_prompt: 5,
  instantly_campaigns: {},
  offer_description: '',
  score_weights: { pain_signal: 3, staff_size: 2, owner_reachable: 2, target_vertical: 1 },
  score_threshold: 5,
  target_verticals: ['handyman'],
  call_list_size: 3,
  auto_unlock_min_days: 14,
  places_max_results: 60,
  places_daily_lead_cap: 200,
}

// Missing or unknown keys fall back to the defaults
export function parseOutreachSettings(rows: OutreachSetting[]): OutreachSettings {
  const settings: Record<string, unknown> = { ...DEFAULT_OUTREACH_SETTINGS }
  for (const row of rows) {
    if (row.key in DEFAULT_OUTREACH_SETTINGS && row.value !== null) {
      settings[row.key] = row.value
    }
  }
  return settings as unknown as OutreachSettings
}
