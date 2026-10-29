import type { OutreachEmail, OutreachEmailUpdate, ReplyClass, SuppressionReason } from '@/types/database'
import type { InstantlyLeadStats } from './instantly-client'

// What one poll of Instantly changes on a sent email (OUTREACH_PLAN.md §11).
// Pure, so it's testable without the API.

export type StatsEvent = 'opened' | 'replied' | 'bounced' | 'unsubscribed'

export type EmailStats = Pick<
  OutreachEmail,
  'open_count' | 'opened_at' | 'replied_at' | 'reply_class' | 'bounced_at' | 'unsubscribed_at'
>

export interface StatsChange {
  updates: OutreachEmailUpdate
  // First time each of these was seen; logged once on the lead's timeline
  events: StatsEvent[]
  // A reply Instantly hasn't labelled: classify its text
  needsClassifying: boolean
  suppress: SuppressionReason | null
}

// Instantly's lt_interest_status
const INTEREST_CLASSES: Record<number, ReplyClass> = {
  0: 'out_of_office',
  1: 'interested',
  2: 'interested', // meeting booked
  3: 'interested', // meeting completed
  4: 'interested', // won
  [-1]: 'other', // not interested
  [-2]: 'wrong_person',
  [-3]: 'other', // lost
  [-4]: 'other', // no show
}

export function replyClassFromInterest(value: number | null | undefined): ReplyClass | null {
  return typeof value === 'number' ? (INTEREST_CLASSES[value] ?? null) : null
}

const BOUNCED = -1
const UNSUBSCRIBED = -2

export function statsUpdate(email: EmailStats, lead: InstantlyLeadStats, now: Date): StatsChange {
  const nowIso = now.toISOString()
  const updates: OutreachEmailUpdate = { stats_synced_at: nowIso }
  const events: StatsEvent[] = []

  // Counts never go down, even if Instantly resets them
  const opens = Math.max(lead.email_open_count ?? 0, email.open_count)
  if (opens !== email.open_count) updates.open_count = opens
  if (opens > 0 && !email.opened_at) {
    updates.opened_at = lead.timestamp_last_open ?? nowIso
    events.push('opened')
  }

  const replied = (lead.email_reply_count ?? 0) > 0 || !!lead.timestamp_last_reply
  if (replied && !email.replied_at) {
    updates.replied_at = lead.timestamp_last_reply ?? nowIso
    events.push('replied')
  }

  // Instantly's label wins over ours, except an unsubscribe request stays one
  const interest = replyClassFromInterest(lead.lt_interest_status)
  if (interest && interest !== email.reply_class && email.reply_class !== 'unsubscribe') {
    updates.reply_class = interest
  }

  if (lead.status === BOUNCED && !email.bounced_at) {
    updates.bounced_at = nowIso
    events.push('bounced')
  }
  if (lead.status === UNSUBSCRIBED && !email.unsubscribed_at) {
    updates.unsubscribed_at = nowIso
    events.push('unsubscribed')
  }

  const suppress: SuppressionReason | null = events.includes('unsubscribed')
    ? 'unsubscribe'
    : events.includes('bounced')
      ? 'hard_bounce'
      : null

  return {
    updates,
    events,
    needsClassifying: (replied || !!email.replied_at) && !interest && !email.reply_class,
    suppress,
  }
}

const AUTO_PAUSE_MIN_SENDS = 20
const AUTO_PAUSE_BOUNCE_RATE = 0.05

// Over 5% bounces in the last 7 days pauses sending (§11). Needs 20 sends
// first: at 20 a day, one bounce in a day would already be 5%.
export function shouldAutoPause(sent: number, bounced: number): boolean {
  return sent >= AUTO_PAUSE_MIN_SENDS && bounced / sent > AUTO_PAUSE_BOUNCE_RATE
}

export const EVENT_TITLES: Record<StatsEvent, string> = {
  opened: 'Opened outreach email',
  replied: 'Replied to outreach email',
  bounced: 'Outreach email bounced',
  unsubscribed: 'Unsubscribed from outreach emails',
}

export const REPLY_CLASS_LABELS: Record<ReplyClass, string> = {
  interested: 'Interested',
  not_now: 'Not now',
  wrong_person: 'Wrong person',
  unsubscribe: 'Unsubscribe',
  out_of_office: 'Out of office',
  other: 'Other',
}
