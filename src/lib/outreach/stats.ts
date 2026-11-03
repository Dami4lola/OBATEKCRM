import type { ReplyClass } from '@/types/database'

// Shared by the inbox sync and the CRM screens (OUTREACH_PLAN.md §11).
// Browser-safe. Opens aren't tracked: emails are plain text, no pixel.

export type StatsEvent = 'replied' | 'bounced' | 'unsubscribed'

const AUTO_PAUSE_MIN_SENDS = 20
const AUTO_PAUSE_BOUNCE_RATE = 0.05

// Over 5% bounces in the last 7 days pauses sending (§11). Needs 20 sends
// first: at 20 a day, one bounce in a day would already be 5%.
export function shouldAutoPause(sent: number, bounced: number): boolean {
  return sent >= AUTO_PAUSE_MIN_SENDS && bounced / sent > AUTO_PAUSE_BOUNCE_RATE
}

export const EVENT_TITLES: Record<StatsEvent, string> = {
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
