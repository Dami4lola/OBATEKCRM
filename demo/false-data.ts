import { auditSignals, primaryHook, type SiteAudit } from '@/lib/outreach/audit-findings'
import { EVENT_TITLES } from '@/lib/outreach/stats'
import type { OutreachHook, ReplyClass } from '@/types/database'
import { sampleDraft } from './sample-copy'

// The demo's made-up business, built fresh on each page load. Every date is
// worked out from today, so nothing goes stale. Names are invented, web and
// email addresses use the reserved .example domain (they can't load or
// receive mail) and phone numbers use the reserved 555-01xx range.

export type Row = Record<string, unknown>
export type Tables = Record<string, Row[]>

const DAY = 86_400_000
// The id the pipeline board asks for (supabase-setup.sql)
const PIPELINE_ID = '00000000-0000-0000-0000-000000000001'
const SENDER_DOMAIN = 'sample-automation.example'
export const DEMO_USER = { id: '00000000-0000-4000-8000-000000000002', email: `demo@${SENDER_DOMAIN}` }
export const DEMO_MAILBOX = `alex@${SENDER_DOMAIN}`

const STAGES = [
  { name: 'New', color: '#6366f1' },
  { name: 'Contacted', color: '#f59e0b' },
  { name: 'Qualified', color: '#3b82f6' },
  { name: 'Proposal', color: '#8b5cf6' },
  { name: 'Won', color: '#22c55e' },
  { name: 'Lost', color: '#ef4444' },
] as const
type StageName = (typeof STAGES)[number]['name']

const NAME_STARTS = ['Quill', 'Bram', 'Lark', 'Thorn', 'Wren', 'Fen', 'Moss', 'Hollow', 'Alder', 'Kestrel', 'Marrow', 'Tansy']
const NAME_ENDS = ['fern', 'wick', 'moor', 'quist', 'haven', 'wold', 'gate', 'brook', 'by', 'dale']

const FIRST_NAMES = ['Sam', 'Maya', 'Leo', 'Priya', 'Owen', 'Nina', 'Theo', 'Carla', 'Ravi', 'Ellis', 'Jo', 'Marcus', 'Dana', 'Tomas', 'Ines', 'Grant', 'Hana', 'Felix', 'Ruth', 'Andre']
const LAST_NAMES = ['Porter', 'Lindgren', 'Okafor', 'Reyes', 'Novak', 'Whitlock', 'Tanaka', 'Mercer', 'Haddad', 'Boone', 'Sandoval', 'Fitch', 'Ames', 'Kowal', 'Baptiste', 'Doyle']

const CITIES = [
  ['Ottawa', 'ON', 'CA', '613'],
  ['Buffalo', 'NY', 'US', '716'],
  ['Rochester', 'NY', 'US', '585'],
  ['Tampa', 'FL', 'US', '813'],
  ['Orlando', 'FL', 'US', '407'],
  ['Austin', 'TX', 'US', '512'],
  ['Houston', 'TX', 'US', '713'],
  ['Chicago', 'IL', 'US', '312'],
  ['Atlanta', 'GA', 'US', '404'],
  ['Charlotte', 'NC', 'US', '704'],
  ['Raleigh', 'NC', 'US', '919'],
  ['Charleston', 'SC', 'US', '843'],
] as const

const INDUSTRIES = [
  {
    vertical: 'handyman',
    suffixes: ['Home Repair', 'Handyman Services', 'Home Services', 'Property Repairs'],
    jobs: ['Office Administrator', 'Dispatcher', 'Customer Service Coordinator'],
    staff: [2, 9],
  },
  {
    vertical: 'agency',
    suffixes: ['Digital', 'Marketing', 'Media Co.', 'Growth Studio'],
    jobs: ['Client Success Coordinator', 'Account Coordinator', 'Sales Development Rep'],
    staff: [3, 15],
  },
  {
    vertical: 'property',
    suffixes: ['Property Group', 'Realty', 'Property Management', 'Rentals & Leasing'],
    jobs: ['Leasing Coordinator', 'Property Administrator', 'Maintenance Coordinator'],
    staff: [3, 16],
  },
] as const

// How many first emails and first calls went out per week, newest week first
const WEEKLY_EMAILS = [11, 11, 11, 10, 9, 7, 6, 5, 4, 3, 2, 1]
const WEEKLY_CALLS = [3, 3, 2, 2, 2, 2, 2, 1, 1, 1, 1, 0]

const NEW_LEADS = 20
const REVIEW_LEADS = 6
const EMAIL_LEADS = 80

interface Outcome {
  reply?: ReplyClass
  replyAfterDays?: number
  bounced?: boolean
  meetingAfterDays?: number
  stage?: StageName
  value?: number
}

// What happened to some first emails, by position (0 is the newest). The
// totals are meant to look ordinary, not impressive.
const EMAIL_OUTCOMES: Record<number, Outcome> = {
  3: { reply: 'interested', replyAfterDays: 1, meetingAfterDays: 5, stage: 'Qualified' },
  11: { reply: 'not_now', replyAfterDays: 2 },
  18: { bounced: true, stage: 'Lost' },
  24: { reply: 'out_of_office', replyAfterDays: 0 },
  33: { reply: 'unsubscribe', replyAfterDays: 1, stage: 'Lost' },
  52: { reply: 'interested', replyAfterDays: 2, meetingAfterDays: 7, stage: 'Proposal', value: 4800 },
  60: { reply: 'wrong_person', replyAfterDays: 1, stage: 'Lost' },
  68: { reply: 'interested', replyAfterDays: 3, meetingAfterDays: 9, stage: 'Won', value: 6200 },
}

const CALL_OUTCOMES: Record<number, Outcome> = {
  2: { meetingAfterDays: 4, stage: 'Qualified' },
  12: { meetingAfterDays: 6, stage: 'Proposal', value: 3600 },
  17: { meetingAfterDays: 5, stage: 'Won', value: 5400 },
}

const MEETING_OUTCOMES = ['Wants a proposal', 'Sending pricing this week', 'Follow-up call booked']

const AUDIT_KINDS = ['no_booking', 'request_only', 'not_mobile', 'slow', 'outdated', 'seo_local', 'generic', 'no_site'] as const
type AuditKind = (typeof AUDIT_KINDS)[number]

// The same numbers every load, so a demo goes the same way each time
function seededRandom(seed: number) {
  let state = seed
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function fixedId(kind: number, index: number): string {
  return `00000000-0000-4000-8${String(kind).padStart(3, '0')}-${String(index).padStart(12, '0')}`
}

function slugOf(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

// Moved back onto a weekday in sending hours
function workingTime(when: Date, random: () => number): Date {
  const at = new Date(when)
  while (at.getDay() === 0 || at.getDay() === 6) at.setDate(at.getDate() - 1)
  at.setHours(9 + Math.floor(random() * 7), Math.floor(random() * 60), 0, 0)
  return at
}

function datesFromWeeks(perWeek: number[], now: Date, random: () => number): Date[] {
  const dates = perWeek.flatMap((count, week) =>
    Array.from({ length: count }, (_, n) =>
      workingTime(new Date(now.getTime() - (1 + week * 7 + (n * 6) / Math.max(count, 1)) * DAY), random)
    )
  )
  return dates.sort((a, b) => b.getTime() - a.getTime())
}

function falseAudit(kind: AuditKind, lead: Row, at: Date, year: number, slowCallback: boolean): SiteAudit {
  const site = lead.website as string | null
  const audit: SiteAudit = {
    audited_at: at.toISOString(),
    input_url: site,
    final_url: site,
    has_site: true,
    website_status: 'found',
    listing: { place_id: `demo-${lead.id}`, name: lead.company_name as string, matched_on: 'name_city' },
    dead_site: false,
    https: true,
    mobile_viewport: true,
    perf_score: 74,
    copyright_year: year,
    has_booking: true,
    booking_tool: 'Calendly',
    has_contact_form: true,
    emails_found: lead.email ? [lead.email as string] : [],
    owner_name: lead.owner_name as string | null,
    seo_issues: [],
    phone_on_homepage: true,
    pages_checked: ['/', '/contact'],
    slow_callback_reviews: slowCallback ? ['"Took three days to get a call back."'] : [],
    errors: [],
  }
  switch (kind) {
    case 'no_site':
      return {
        ...audit,
        has_site: false,
        website_status: 'none_confirmed',
        https: false,
        mobile_viewport: null,
        perf_score: null,
        copyright_year: null,
        has_booking: false,
        booking_tool: null,
        has_contact_form: false,
        emails_found: [],
        phone_on_homepage: false,
        pages_checked: [],
      }
    case 'no_booking':
      return { ...audit, has_booking: false, booking_tool: null, has_contact_form: false }
    case 'request_only':
      return { ...audit, booking_tool: null, request_paths: ['/request-a-quote'] }
    case 'not_mobile':
      return { ...audit, mobile_viewport: false }
    case 'slow':
      return { ...audit, perf_score: 34 }
    case 'outdated':
      return { ...audit, copyright_year: year - 5 }
    case 'seo_local':
      return { ...audit, seo_issues: ['No city named in the page title'] }
    case 'generic':
      return audit
  }
}

function companyNames(random: () => number): string[] {
  const stems = NAME_STARTS.flatMap((start) => NAME_ENDS.map((end) => start + end))
  for (let i = stems.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[stems[i], stems[j]] = [stems[j], stems[i]]
  }
  return stems
}

function buildLeads(now: Date, random: () => number, stageId: (name: StageName) => string, stems: string[]): Row[] {
  const year = now.getFullYear()
  const total = NEW_LEADS + EMAIL_LEADS + WEEKLY_CALLS.reduce((sum, n) => sum + n, 0)

  return Array.from({ length: total }, (_, i) => {
    const industry = INDUSTRIES[i % INDUSTRIES.length]
    const [city, region, country, area] = CITIES[Math.floor(random() * CITIES.length)]
    // Stepping through both lists keeps every full name different
    const first = FIRST_NAMES[i % FIRST_NAMES.length]
    const last = LAST_NAMES[(i * 7 + Math.floor(i / FIRST_NAMES.length)) % LAST_NAMES.length]
    const company = `${stems[i]} ${industry.suffixes[i % industry.suffixes.length]}`
    const slug = slugOf(company)
    const kind = AUDIT_KINDS[Math.floor(random() * AUDIT_KINDS.length)]
    const hasSite = kind !== 'no_site'
    const lead: Row = {
      id: fixedId(1, i),
      stage_id: stageId(i < NEW_LEADS ? 'New' : 'Contacted'),
      company_name: company,
      contact_name: `${first} ${last}`,
      email: `${first.toLowerCase()}@${slug}.example`,
      phone: `(${area}) 555-01${String(i % 100).padStart(2, '0')}`,
      value: null,
      payment_terms: null,
      notes: null,
      job_title: 'Owner',
      website: hasSite ? `https://www.${slug}.example` : null,
      city,
      region,
      country,
      vertical: industry.vertical,
      staff_size: industry.staff[0] + Math.floor(random() * (industry.staff[1] - industry.staff[0])),
      linkedin_url: null,
      email_source: hasSite ? 'website' : 'lusha',
      lead_source: i % 5 === 0 ? 'theirstack' : i % 7 === 0 ? 'state_license' : 'places',
      source_ref: null,
      google_place_id: `demo-${slug}`,
      google_rating: Math.round((3.8 + random() * 1.2) * 10) / 10,
      google_review_count: 6 + Math.floor(random() * 90),
      // Some sites don't name an owner, which lowers the score
      owner_name: i >= REVIEW_LEADS && random() < 0.3 ? null : `${first} ${last}`,
      signals: {},
      audit: null,
      audited_at: null,
      position_index: 0,
      created_at: new Date(now.getTime() - (10 + random() * 75) * DAY).toISOString(),
      updated_at: now.toISOString(),
    }
    const checkedAt = new Date(now.getTime() - (1 + random() * 18) * DAY)
    const audit = falseAudit(kind, lead, checkedAt, year, random() < 0.2)
    lead.audit = audit
    lead.audited_at = checkedAt.toISOString()
    lead.signals = auditSignals(audit, {}, lead.vertical as string)
    return lead
  })
}

// Leads in New that show the checks at work
function addWarningLeads(leads: Row[], suppressed: string) {
  const [noEmail, consent, unsubscribed, lowScore] = leads.slice(REVIEW_LEADS, REVIEW_LEADS + 4)
  noEmail.email = null
  Object.assign(consent, { city: 'Ottawa', region: 'ON', country: 'CA', email_source: 'lusha' })
  unsubscribed.email = suppressed
  Object.assign(lowScore, { owner_name: null, staff_size: 60, signals: { checked_at: lowScore.audited_at } })
}

interface Built {
  emails: Row[]
  activities: Row[]
  meetings: Row[]
  suppressions: Row[]
}

function meetingRow(lead: Row, index: number, at: Date, now: Date): Row {
  const held = at.getTime() < now.getTime()
  return {
    id: fixedId(6, index),
    lead_id: lead.id,
    meeting_date: at.toISOString(),
    title: `Discovery call with ${lead.company_name}`,
    attendee_name: lead.contact_name,
    attendee_role: 'decision_maker',
    field_of_work: lead.vertical,
    notes: null,
    outcome: held ? MEETING_OUTCOMES[index % MEETING_OUTCOMES.length] : null,
    created_at: at.toISOString(),
    updated_at: at.toISOString(),
  }
}

function sentEmailRow(lead: Row, index: number, sentAt: Date, outcome: Outcome, hook: OutreachHook, settings: Row[], now: Date, runId: string): Row {
  const draft = sampleDraft(lead, hook, settings, index)
  const repliedAt = outcome.reply ? new Date(sentAt.getTime() + (outcome.replyAfterDays ?? 1) * DAY) : null
  const age = (now.getTime() - sentAt.getTime()) / DAY
  const stopped = outcome.bounced ? 'Bounced' : outcome.reply === 'unsubscribe' ? 'Unsubscribed' : outcome.reply ? 'They replied' : null
  const active = !stopped && age < 7
  return {
    id: fixedId(3, index),
    lead_id: lead.id,
    run_id: runId,
    status: 'sent',
    blocked_reason: null,
    audit: lead.audit,
    primary_hook: hook,
    steps: draft.steps,
    opener: draft.opener,
    template_key: draft.templateKey,
    draft_steps: draft.steps,
    drafted_at: new Date(sentAt.getTime() - DAY).toISOString(),
    last_error: null,
    author: index % 4 === 0 ? 'claude_edited' : 'claude',
    model: 'claude',
    instantly_campaign_id: null,
    instantly_lead_id: null,
    approved_at: new Date(sentAt.getTime() - DAY / 2).toISOString(),
    sent_at: sentAt.toISOString(),
    opened_at: null,
    open_count: 0,
    replied_at: repliedAt?.toISOString() ?? null,
    reply_class: outcome.reply ?? null,
    bounced_at: outcome.bounced ? new Date(sentAt.getTime() + 3_600_000).toISOString() : null,
    unsubscribed_at: outcome.reply === 'unsubscribe' ? repliedAt?.toISOString() : null,
    is_example: false,
    linkedin_draft: draft.linkedin,
    stats_synced_at: null,
    queued_at: new Date(sentAt.getTime() - 3_600_000).toISOString(),
    sequence_state: stopped ? 'stopped' : active ? 'active' : 'finished',
    next_step: active ? (age < 3 ? 2 : 3) : null,
    next_step_at: active ? new Date(sentAt.getTime() + (age < 3 ? 3 : 7) * DAY).toISOString() : null,
    stopped_reason: stopped,
    created_at: new Date(sentAt.getTime() - DAY).toISOString(),
    updated_at: sentAt.toISOString(),
  }
}

function applyOutcome(lead: Row, outcome: Outcome, stageId: (name: StageName) => string) {
  if (outcome.stage) lead.stage_id = stageId(outcome.stage)
  if (outcome.value) Object.assign(lead, { value: outcome.value, payment_terms: 'one_time' })
}

function buildOutreach(leads: Row[], settings: Row[], now: Date, random: () => number, stageId: (name: StageName) => string, runIdFor: (date: Date) => string): Built {
  const built: Built = { emails: [], activities: [], meetings: [], suppressions: [] }
  const addActivity = (lead: Row, type: string, title: string, at: string, meta: Row) =>
    built.activities.push({
      id: fixedId(5, built.activities.length),
      lead_id: lead.id,
      type,
      title,
      description: null,
      meta,
      created_at: at,
    })

  datesFromWeeks(WEEKLY_EMAILS, now, random).forEach((sentAt, index) => {
    const lead = leads[NEW_LEADS + index]
    const outcome = EMAIL_OUTCOMES[index] ?? {}
    const hook: OutreachHook = index % 9 === 3 ? 'job_post' : primaryHook(lead.audit as SiteAudit, lead.vertical as string, now)
    const email = sentEmailRow(lead, index, sentAt, outcome, hook, settings, now, runIdFor(sentAt))
    built.emails.push(email)
    applyOutcome(lead, outcome, stageId)
    addActivity(lead, 'email', 'Outreach email 1 sent', sentAt.toISOString(), { channel: 'email' })
    if (email.replied_at) addActivity(lead, 'email', EVENT_TITLES.replied, email.replied_at as string, { channel: 'email' })
    if (outcome.reply === 'unsubscribe') {
      built.suppressions.push({ id: fixedId(7, 0), email: lead.email, domain: null, reason: 'unsubscribe', added_at: email.replied_at })
    }
    if (outcome.bounced) {
      built.suppressions.push({ id: fixedId(7, 1), email: lead.email, domain: null, reason: 'hard_bounce', added_at: email.bounced_at })
    }
    if (outcome.meetingAfterDays) {
      const at = workingTime(new Date(sentAt.getTime() + outcome.meetingAfterDays * DAY), random)
      built.meetings.push(meetingRow(lead, built.meetings.length, at, now))
    }
  })

  datesFromWeeks(WEEKLY_CALLS, now, random).forEach((calledAt, index) => {
    const lead = leads[NEW_LEADS + EMAIL_LEADS + index]
    const outcome = CALL_OUTCOMES[index] ?? {}
    applyOutcome(lead, outcome, stageId)
    const result = outcome.meetingAfterDays
      ? { outcome: 'meeting_booked', title: 'Call: Meeting booked' }
      : index % 3 === 0
        ? { outcome: 'talked', title: 'Call: Talked' }
        : { outcome: 'no_answer', title: 'Call: No answer' }
    addActivity(lead, 'call', result.title, calledAt.toISOString(), { outcome: result.outcome, channel: 'call' })
    if (outcome.meetingAfterDays) {
      const at = workingTime(new Date(calledAt.getTime() + outcome.meetingAfterDays * DAY), random)
      built.meetings.push(meetingRow(lead, built.meetings.length, at, now))
    }
  })

  return built
}

function reviewRun(leads: Row[], settings: Row[], now: Date): { run: Row; emails: Row[] } {
  const runId = fixedId(2, 0)
  const startedAt = new Date(now.getTime() - DAY / 4).toISOString()
  const emails = leads.slice(0, REVIEW_LEADS).map((lead, index) => {
    const hook: OutreachHook = index === 0 ? 'job_post' : primaryHook(lead.audit as SiteAudit, lead.vertical as string, now)
    const draft = sampleDraft(lead, hook, settings, index)
    return {
      id: fixedId(3, 500 + index),
      lead_id: lead.id,
      run_id: runId,
      status: index === 1 ? 'approved' : 'draft',
      blocked_reason: null,
      audit: lead.audit,
      primary_hook: hook,
      steps: draft.steps,
      opener: draft.opener,
      template_key: draft.templateKey,
      draft_steps: draft.steps,
      drafted_at: startedAt,
      last_error: null,
      author: 'claude',
      model: 'claude',
      instantly_campaign_id: null,
      instantly_lead_id: null,
      approved_at: index === 1 ? startedAt : null,
      sent_at: null,
      opened_at: null,
      open_count: 0,
      replied_at: null,
      reply_class: null,
      bounced_at: null,
      unsubscribed_at: null,
      is_example: false,
      linkedin_draft: draft.linkedin,
      stats_synced_at: null,
      queued_at: null,
      sequence_state: null,
      next_step: null,
      next_step_at: null,
      stopped_reason: null,
      created_at: startedAt,
      updated_at: startedAt,
    }
  })
  return {
    run: {
      id: runId,
      status: 'awaiting_review',
      mode: 'manual',
      scheduled_for: startedAt,
      started_at: startedAt,
      finished_at: null,
      created_by: DEMO_USER.id,
      summary: {},
      created_at: startedAt,
      updated_at: startedAt,
    },
    emails,
  }
}

function seedCopies(now: Date, random: () => number): Row[] {
  const placements = ['inbox', 'inbox', 'inbox', 'inbox', 'inbox', 'promotions', 'inbox', 'inbox', 'spam', 'inbox']
  const rows: Row[] = []
  for (let week = 0; week < 12; week++) {
    const sentAt = workingTime(new Date(now.getTime() - (1 + week * 7) * DAY), random)
    for (let seed = 1; seed <= 3; seed++) {
      rows.push({
        id: fixedId(4, rows.length),
        email_id: null,
        kind: 'seed',
        step: 1,
        to_address: `seed${seed}@${SENDER_DOMAIN}`,
        subject: 'A question for your business',
        graph_message_id: null,
        internet_message_id: null,
        conversation_id: null,
        sent_at: sentAt.toISOString(),
        // The newest copies are still waiting to be marked
        placement: week === 0 ? null : placements[rows.length % placements.length],
        placement_checked_at: week === 0 ? null : sentAt.toISOString(),
      })
    }
  }
  return rows
}

function jobPosts(leads: Row[], now: Date, random: () => number, stems: string[]): Row[] {
  const signal = (index: number, values: Row): Row => {
    const createdAt = new Date(now.getTime() - (0.2 + random() * 6) * DAY)
    return {
      id: fixedId(8, index),
      lead_id: null,
      source: 'theirstack',
      external_id: `demo-${index}`,
      kind: 'job_post',
      region: 'us',
      job_title: null,
      matched_term: null,
      job_url: `https://jobs.example/post/${index}`,
      posted_at: createdAt.toISOString().slice(0, 10),
      location: null,
      state_code: null,
      country_code: 'US',
      company_name: null,
      company_domain: null,
      company_linkedin_url: null,
      employee_count: null,
      industry: null,
      hiring_team: [],
      excerpt: null,
      fit: 'fit',
      fit_target: null,
      fit_reason: null,
      fit_checked_at: createdAt.toISOString(),
      status: 'lead_created',
      created_at: createdAt.toISOString(),
      ...values,
    }
  }

  const fits = [0, 1, 2, 10, 11, 12, 13, 14].map((leadIndex, index) => {
    const lead = leads[leadIndex]
    const industry = INDUSTRIES.find((i) => i.vertical === lead.vertical)!
    const title = industry.jobs[index % industry.jobs.length]
    lead.signals = { ...(lead.signals as Row), hiring: true }
    return signal(index, {
      lead_id: lead.id,
      job_title: title,
      matched_term: title,
      location: `${lead.city}, ${lead.region}`,
      state_code: lead.region,
      company_name: lead.company_name,
      company_domain: `${slugOf(lead.company_name as string)}.example`,
      employee_count: lead.staff_size,
      industry: lead.vertical,
      fit_target: lead.vertical === 'handyman' ? 'trades' : lead.vertical,
      fit_reason: `Small ${lead.vertical} business hiring for work that could be automated`,
      excerpt: 'Answer calls, schedule appointments and keep customer records up to date.',
      hiring_team: [{ name: lead.contact_name, role: 'Owner', linkedin_url: null }],
    })
  })

  const notFits = [
    ['Regional Operations Manager', 'Over 200 staff, too big for this offer'],
    ['Recruiter', 'A staffing firm hiring for a client'],
    ['Front Desk Associate', "A dental office, which isn't a target industry"],
    ['Senior Software Engineer', "Not a role the offer would replace"],
    ['Executive Assistant', 'Enterprise company with its own systems'],
  ].map(([title, reason], index) =>
    signal(8 + index, {
      job_title: title,
      matched_term: title,
      location: 'Chicago, IL',
      company_name: `${stems[stems.length - 1 - index]} Holdings`,
      employee_count: 240 + index * 35,
      fit: 'not_fit',
      fit_target: 'other',
      fit_reason: reason,
      status: 'discarded',
    })
  )

  const software = [15, 16].map((leadIndex, index) => {
    const lead = leads[leadIndex]
    return signal(13 + index, {
      lead_id: lead.id,
      kind: 'technology',
      job_title: null,
      matched_term: lead.vertical === 'agency' ? 'GoHighLevel' : 'AppFolio',
      location: `${lead.city}, ${lead.region}`,
      company_name: lead.company_name,
      employee_count: lead.staff_size,
      fit_reason: 'Seen in their job posts',
    })
  })

  return [...fits, ...notFits, ...software]
}

function settingsRows(now: Date): Row[] {
  const updatedAt = now.toISOString()
  const row = (key: string, value: unknown): Row => ({ key, value, updated_at: updatedAt })
  return [
    row('sending_paused', false),
    row('warmup_started_at', new Date(now.getTime() - 12 * 7 * DAY).toISOString()),
    row('seed_addresses', [1, 2, 3].map((n) => `seed${n}@${SENDER_DOMAIN}`)),
    row('offer_description', 'Sample Automation Co. helps small businesses take bookings and answer enquiries.'),
  ]
}

export function buildFalseData(now: Date): Tables {
  const random = seededRandom(20261105)
  const stages = STAGES.map((stage, index) => ({
    id: fixedId(0, index),
    pipeline_id: PIPELINE_ID,
    name: stage.name,
    color: stage.color,
    order_index: index,
    created_at: now.toISOString(),
  }))
  const stageId = (name: StageName) => stages.find((stage) => stage.name === name)!.id

  const settings = settingsRows(now)
  const stems = companyNames(random)
  const leads = buildLeads(now, random, stageId, stems)

  // One finished run per week of sending
  const runs = new Map<number, Row>()
  const runIdFor = (date: Date) => {
    const week = Math.floor((now.getTime() - date.getTime()) / (7 * DAY))
    if (!runs.has(week)) {
      const at = date.toISOString()
      runs.set(week, {
        id: fixedId(2, week + 1),
        status: 'completed',
        mode: 'manual',
        scheduled_for: at,
        started_at: at,
        finished_at: at,
        created_by: DEMO_USER.id,
        summary: {},
        created_at: at,
        updated_at: at,
      })
    }
    return runs.get(week)!.id as string
  }

  const outreach = buildOutreach(leads, settings, now, random, stageId, runIdFor)
  const unsubscribed = outreach.suppressions.find((row) => row.reason === 'unsubscribe')?.email as string
  addWarningLeads(leads, `billing@${unsubscribed.split('@')[1]}`)
  outreach.suppressions.push({ id: fixedId(7, 2), email: leads[REVIEW_LEADS + 2].email, domain: null, reason: 'manual', added_at: now.toISOString() })
  const signals = jobPosts(leads, now, random, stems)
  const review = reviewRun(leads, settings, now)

  // Cards stack by stage. Leads ready to email come first in New, so Run
  // outreach doesn't open on the ones it can't use.
  const positions = new Map<unknown, number>()
  for (const lead of [...leads.slice(REVIEW_LEADS + 4), ...leads.slice(0, REVIEW_LEADS + 4)]) {
    const next = positions.get(lead.stage_id) ?? 0
    lead.position_index = next
    positions.set(lead.stage_id, next + 1)
  }

  const today = now.toISOString().slice(0, 10)
  const tasks = leads.slice(NEW_LEADS + 4, NEW_LEADS + 6).map((lead, index) => ({
    id: fixedId(9, index),
    lead_id: lead.id,
    title: `Call ${lead.contact_name}`,
    description: null,
    due_date: today,
    status: 'pending',
    completed_at: null,
    kind: 'call',
    created_at: now.toISOString(),
  }))

  return {
    pipelines: [{ id: PIPELINE_ID, name: 'Sales Pipeline', created_at: now.toISOString() }],
    stages,
    leads,
    activities: outreach.activities,
    tasks,
    meetings: outreach.meetings,
    outreach_runs: [review.run, ...runs.values()],
    outreach_emails: [...review.emails, ...outreach.emails],
    outreach_messages: seedCopies(now, random),
    outreach_settings: settings,
    suppression_list: outreach.suppressions,
    lead_signals: signals,
    dismissed_leads: [],
    google_calls: [],
    copy_feedback: [
      'Keep the opener to one sentence.',
      "Don't mention competitors by name.",
      'Say what we noticed, then stop. No flattery.',
    ].map((note, index) => ({
      id: fixedId(10, index),
      note,
      vertical: null,
      active: true,
      email_id: null,
      created_by: DEMO_USER.id,
      created_at: now.toISOString(),
    })),
  }
}
