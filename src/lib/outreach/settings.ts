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
  example_min_sends: number
  example_max_in_prompt: number
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
  cron_drafts_per_tick: number
  reply_model: string
  // Set when sending was paused automatically (bounces); null otherwise
  sending_paused_reason: string | null
  // Sending from the Microsoft 365 mailbox (014)
  sending_domain: string
  send_timezone: string
  sends_per_tick: number
  // Business days before step 2, then before step 3
  followup_business_days: number[]
  // Warm-up: a day's limit in week 1, 2, 3, 4+ after warmup_started_at
  send_ramp: number[]
  warmup_started_at: string | null
  seed_addresses: string[]
  auto_unlock_reply_rate: number
  // Staff counts that earn the size points, by vertical (015)
  staff_range: Record<string, [number, number]>
  // Buying signals from job posts (017)
  signal_roles: string[]
  signal_regions: SignalRegion[]
  // "US:Texas" -> TheirStack location id, looked up once
  signal_location_ids: Record<string, number>
  signal_max_age_days: number
  signal_staff_range: [number, number]
  // Local hour (send_timezone) after which the daily pull runs
  signal_pull_hour: number
  signal_fit_model: string
  signals_pulled_at: string | null
}

export interface SignalPlace {
  name: string
  // US: a state; elsewhere a city with a radius
  state_code?: string
  near?: [number, number]
  radius_km?: number
}

// One TheirStack search a day; daily_jobs is the most it returns (1 credit each)
export interface SignalRegion {
  key: string
  name: string
  country: string
  places: SignalPlace[]
  extra_roles: string[]
  daily_jobs: number
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

// Mirrors the seed rows in supabase/migrations/002_outreach.sql, 004_sourcing.sql, 005_audit.sql, 007_cleanup_rules.sql, 008_company_size.sql, 009_write_step.sql, 010_send.sql, 012_car_dealer_template.sql, 013_scheduler_stats.sql, 014_mailbox.sql, 015_agencies.sql and 017_buying_signals.sql
export const DEFAULT_OUTREACH_SETTINGS: OutreachSettings = {
  source_stage_name: 'New',
  target_stage_name: 'Contacted',
  mode: 'manual',
  sending_paused: true,
  daily_send_cap: 20,
  send_window: { start: '08:30', end: '16:30', weekdays_only: true },
  resequence_cooldown_days: 180,
  auto_unlock_min_sends: 50,
  example_min_sends: 10,
  example_max_in_prompt: 5,
  offer_description: '',
  score_weights: { pain_signal: 3, staff_size: 2, owner_reachable: 2, target_vertical: 1 },
  score_threshold: 5,
  target_verticals: ['handyman', 'agency'],
  call_list_size: 3,
  auto_unlock_min_days: 14,
  places_max_results: 60,
  places_daily_lead_cap: 200,
  audit_max_age_days: 30,
  audit_daily_cap: 800,
  generic_email_keep_score: 7,
  small_business_max_staff: 50,
  // Mirrors 009_write_step.sql, 012_car_dealer_template.sql and 015_agencies.sql; edit there (or in the settings table)
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
    car_dealer: [
      {
        step: 1,
        subject: '{{subject}}',
        body: "Hi {{first_name}},\n\n{{opener}}\n\nI'm {{sender_first_name}}. I run OBATEK here in Ottawa. We help dealerships let buyers book test drives online, follow up on every enquiry, and answer calls with an AI receptionist when the team is busy or the lot is closed.\n\nWould a free one-page audit of how {{company}} handles calls and buyer enquiries be useful?\n\n{{sender_name}}",
      },
      {
        step: 2,
        subject: 're: {{subject}}',
        body: "Hi {{first_name}},\n\nFollowing up in case my last note got buried. If a missed call or a slow reply to a test-drive request ever cost {{company}} a sale, the free audit would show where. It takes me about 20 minutes and you keep it either way.\n\nWorth sending over?\n\n{{sender_first_name}}",
      },
      {
        step: 3,
        subject: 're: {{subject}}',
        body: "Hi {{first_name}},\n\nI'll leave it here. If it's ever useful, reply \"audit\" and I'll put it together for {{company}}.\n\n{{sender_first_name}}",
      },
    ],
    agency: [
      {
        step: 1,
        subject: '{{subject}}',
        body: "Hi {{first_name}},\n\n{{opener}}\n\nI'm {{sender_first_name}}. I run OBATEK, a small automation shop. We set up the back office for agencies like {{company}}: instant follow-up on every new inquiry, an AI receptionist for your sales line during client calls, and discovery calls booked straight onto your calendar.\n\nWould a free one-page audit of how {{company}} handles new inquiries be useful?\n\n{{sender_name}}",
      },
      {
        step: 2,
        subject: 're: {{subject}}',
        body: "Hi {{first_name}},\n\nFollowing up in case my last note got buried. If a good lead ever went cold while the team was heads-down on client work, the free audit would show where {{company}}'s inquiries slip. It takes me about 20 minutes and you keep it either way.\n\nWorth sending over?\n\n{{sender_first_name}}",
      },
      {
        step: 3,
        subject: 're: {{subject}}',
        body: "Hi {{first_name}},\n\nI'll leave it here. If it's ever useful, reply \"audit\" and I'll put it together for {{company}}.\n\n{{sender_first_name}}",
      },
    ],
  },
  sender_name: 'Dami Ayoade',
  copy_model: 'claude-opus-5-5',
  draft_daily_cap: 300,
  // Each draft is a Claude call of up to ~30s; a tick should finish well
  // inside the scheduler's request timeout
  cron_drafts_per_tick: 5,
  reply_model: 'claude-haiku-5-5',
  sending_paused_reason: null,
  sending_domain: 'getobatek.com',
  send_timezone: 'America/Toronto',
  sends_per_tick: 2,
  followup_business_days: [3, 5],
  send_ramp: [5, 10, 15, 20],
  warmup_started_at: null,
  seed_addresses: [],
  auto_unlock_reply_rate: 0.05,
  staff_range: { default: [2, 15], agency: [2, 20] },
  signal_roles: [
    'appointment setter',
    'sales development representative',
    'SDR',
    'lead generation specialist',
    'CRM administrator',
    'GoHighLevel',
  ],
  signal_regions: [
    {
      key: 'us',
      name: 'US target states',
      country: 'US',
      places: [
        { name: 'New York', state_code: 'NY' },
        { name: 'Florida', state_code: 'FL' },
        { name: 'Texas', state_code: 'TX' },
        { name: 'Illinois', state_code: 'IL' },
        { name: 'Georgia', state_code: 'GA' },
        { name: 'North Carolina', state_code: 'NC' },
        { name: 'South Carolina', state_code: 'SC' },
      ],
      extra_roles: [],
      daily_jobs: 30,
    },
    {
      key: 'ottawa',
      name: 'Ottawa area',
      country: 'CA',
      places: [{ name: 'Ottawa', near: [45.4215, -75.6972], radius_km: 60 }],
      // The Build Plan's original trades signal
      extra_roles: ['dispatcher', 'office administrator'],
      daily_jobs: 10,
    },
  ],
  signal_location_ids: {},
  signal_max_age_days: 3,
  signal_staff_range: [2, 20],
  signal_pull_hour: 7,
  signal_fit_model: 'claude-haiku-5-5',
  signals_pulled_at: null,
}

// Missing or unknown keys fall back to the defaults
export function parseOutreachSettings(rows: OutreachSetting[]): OutreachSettings {
  const settings: Record<string, unknown> = { ...DEFAULT_OUTREACH_SETTINGS }
  for (const row of rows) {
    if (row.key in DEFAULT_OUTREACH_SETTINGS && row.value !== null) {
      settings[row.key] = row.value
    }
  }
  // Templates merge by vertical: a saved set doesn't hide templates added
  // in code later (car_dealer before 012 is run)
  const saved = settings.email_templates
  if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
    settings.email_templates = { ...DEFAULT_OUTREACH_SETTINGS.email_templates, ...saved }
  }
  return settings as unknown as OutreachSettings
}
