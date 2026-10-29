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
  audit_max_age_days: number
  audit_daily_cap: number
  generic_email_keep_score: number
  small_business_max_staff: number
  email_templates: Record<string, TemplateStep[]>
  sender_name: string
  copy_model: string
  draft_daily_cap: number
  instantly_body_format: 'html' | 'text'
}

export interface TemplateStep {
  step: 1 | 2 | 3
  subject: string
  body: string
}

export interface ScoreWeights {
  pain_signal: number
  staff_size: number
  owner_reachable: number
  target_vertical: number
}

// Mirrors the seed rows in supabase/migrations/002_outreach.sql, 004_sourcing.sql, 005_audit.sql, 007_cleanup_rules.sql, 008_company_size.sql, 009_write_step.sql and 010_send.sql
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
  audit_max_age_days: 30,
  audit_daily_cap: 800,
  generic_email_keep_score: 7,
  small_business_max_staff: 50,
  // Mirrors 009_write_step.sql; edit there (or in the settings table)
  email_templates: {
    default: [
      {
        step: 1,
        subject: '{{subject}}',
        body: "Hi {{first_name}},\n\n{{opener}}\n\nI'm {{sender_first_name}}. I run OBATEK here in Ottawa. We set up simple tools for trades businesses: online quotes and booking, job tracking, and an AI receptionist that picks up when you're on a job.\n\nWould a free one-page audit of how {{company}} handles calls and quotes be useful?\n\n{{sender_name}}",
      },
      {
        step: 2,
        subject: 're: {{subject}}',
        body: 'Hi {{first_name}},\n\nFollowing up in case my last note got buried. If missed calls or slow quotes ever cost {{company}} a job, the free audit would show where. It takes me about 20 minutes and you keep it either way.\n\nWorth sending over?\n\n{{sender_first_name}}',
      },
      {
        step: 3,
        subject: 're: {{subject}}',
        body: 'Hi {{first_name}},\n\nI\'ll leave it here. If it\'s ever useful, reply "audit" and I\'ll put it together for {{company}}.\n\n{{sender_first_name}}',
      },
    ],
  },
  sender_name: 'Dami Ayoade',
  copy_model: 'claude-opus-5-5',
  draft_daily_cap: 300,
  instantly_body_format: 'html',
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
