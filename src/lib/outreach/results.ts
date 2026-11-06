import type { OutreachHook, ReplyClass, SeedPlacement } from '@/types/database'
import { HOOK_LABELS } from './audit-findings'
import { emailDomain, OWN_DOMAINS } from './compliance'
import { REPLY_CLASS_LABELS } from './stats'

// The sums behind the Results page (OUTREACH_PLAN.md §12). Browser-safe, and
// the demo runs the same code on its false data.
//
// A date range picks who was first contacted in those dates, then follows
// them: a reply or meeting after the end date still counts.

export interface ResultsRange {
  from: Date
  to: Date
}

// A lead's first email in a run. Emailed again after the cooldown, it counts again.
export interface ResultsEmail {
  lead_id: string
  sent_at: string
  replied_at: string | null
  reply_class: ReplyClass | null
  bounced_at: string | null
  unsubscribed_at: string | null
  primary_hook: OutreachHook | null
  vertical: string | null
  address: string | null
}

export interface ResultsCall {
  lead_id: string
  created_at: string
  address: string | null
}

export interface ResultsMeeting {
  lead_id: string
  meeting_date: string
}

export interface ResultsSeedCopy {
  sent_at: string
  placement: SeedPlacement | null
}

export interface ResultsData {
  emails: ResultsEmail[]
  calls: ResultsCall[]
  meetings: ResultsMeeting[]
  seedCopies: ResultsSeedCopy[]
}

export interface CountRow {
  key: string
  label: string
  count: number
}

export interface ChannelRow {
  key: 'email' | 'call'
  label: string
  contacted: number
  meetings: number
  per100: number | null
}

export interface BreakdownRow {
  key: string
  label: string
  emailed: number
  replied: number
  replyRate: number
}

export interface Results {
  emailed: number
  replied: number
  replyRate: number | null
  bounced: number
  bounceRate: number | null
  unsubscribed: number
  replyLabels: CountRow[]
  placement: CountRow[]
  contacted: number
  meetings: number
  per100: number | null
  channels: ChannelRow[]
  byIndustry: BreakdownRow[]
  byHook: BreakdownRow[]
}

const PAGE_SIZE = 1000

// The API returns 1,000 rows at most, so read a table a page at a time
export async function allRows<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>
): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1)
    if (error) throw error
    rows.push(...(data || []))
    if (!data || data.length < PAGE_SIZE) return rows
  }
}

const NOT_LABELLED = 'unlabelled'
const NOT_CHECKED = 'unchecked'
const NOT_SET = 'none'

const PLACEMENT_LABELS: Record<SeedPlacement, string> = {
  inbox: 'Inbox',
  promotions: 'Promotions',
  spam: 'Spam',
  missing: 'Missing',
}

function isOwnAddress(address: string | null): boolean {
  return !!address && OWN_DOMAINS.has(emailDomain(address) ?? '')
}

function inRange(at: string, { from, to }: ResultsRange): boolean {
  const time = new Date(at).getTime()
  return time >= from.getTime() && time <= to.getTime()
}

function rate(part: number, whole: number): number | null {
  return whole > 0 ? part / whole : null
}

// An auto-reply says nothing about the email, so it isn't a reply here
function isRealReply(email: ResultsEmail): boolean {
  return !!email.replied_at && email.reply_class !== 'out_of_office'
}

function countBy<T>(items: T[], keyOf: (item: T) => string): Map<string, number> {
  const counts = new Map<string, number>()
  for (const item of items) {
    const key = keyOf(item)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return counts
}

function byCountDesc(a: CountRow, b: CountRow): number {
  return b.count - a.count || a.label.localeCompare(b.label)
}

function replyLabelRows(emails: ResultsEmail[]): CountRow[] {
  const counts = countBy(emails.filter((e) => e.replied_at), (e) => e.reply_class ?? NOT_LABELLED)
  return [...counts]
    .map(([key, count]) => ({
      key,
      label: key === NOT_LABELLED ? 'Not labelled yet' : REPLY_CLASS_LABELS[key as ReplyClass],
      count,
    }))
    .sort(byCountDesc)
}

function placementRows(seedCopies: ResultsSeedCopy[], range: ResultsRange): CountRow[] {
  const inDates = seedCopies.filter((copy) => inRange(copy.sent_at, range))
  const counts = countBy(inDates, (copy) => copy.placement ?? NOT_CHECKED)
  return [...counts]
    .map(([key, count]) => ({
      key,
      label: key === NOT_CHECKED ? 'Not checked' : PLACEMENT_LABELS[key as SeedPlacement],
      count,
    }))
    .sort(byCountDesc)
}

function breakdown(
  emails: ResultsEmail[],
  keyOf: (email: ResultsEmail) => string,
  labelOf: (key: string) => string
): BreakdownRow[] {
  const groups = new Map<string, ResultsEmail[]>()
  for (const email of emails) {
    const key = keyOf(email)
    groups.set(key, [...(groups.get(key) ?? []), email])
  }
  return [...groups]
    .map(([key, group]) => {
      const replied = group.filter(isRealReply).length
      return { key, label: labelOf(key), emailed: group.length, replied, replyRate: replied / group.length }
    })
    .sort((a, b) => b.replyRate - a.replyRate || b.emailed - a.emailed || a.label.localeCompare(b.label))
}

function industryLabel(key: string): string {
  if (key === NOT_SET) return 'Not set'
  const words = key.replace(/_/g, ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

function hookLabel(key: string): string {
  return key === NOT_SET ? 'Not set' : HOOK_LABELS[key as OutreachHook]
}

interface FirstTouch {
  channel: 'email' | 'call'
  at: number
}

// Whichever came first, across all time: a lead called in March and emailed
// in April was first contacted in March, by call
function firstTouches(emails: ResultsEmail[], calls: ResultsCall[]): Map<string, FirstTouch> {
  const touches = new Map<string, FirstTouch>()
  const consider = (leadId: string, channel: FirstTouch['channel'], when: string) => {
    const at = new Date(when).getTime()
    const seen = touches.get(leadId)
    if (!seen || at < seen.at) touches.set(leadId, { channel, at })
  }
  for (const email of emails) consider(email.lead_id, 'email', email.sent_at)
  for (const call of calls) consider(call.lead_id, 'call', call.created_at)
  return touches
}

function channelRows(
  touches: Map<string, FirstTouch>,
  meetings: ResultsMeeting[],
  range: ResultsRange
): ChannelRow[] {
  const rows: ChannelRow[] = [
    { key: 'email', label: 'Email', contacted: 0, meetings: 0, per100: null },
    { key: 'call', label: 'Call', contacted: 0, meetings: 0, per100: null },
  ]
  const inDates = new Map(
    [...touches].filter(([, touch]) => touch.at >= range.from.getTime() && touch.at <= range.to.getTime())
  )
  for (const touch of inDates.values()) {
    rows.find((row) => row.key === touch.channel)!.contacted++
  }
  for (const meeting of meetings) {
    const touch = inDates.get(meeting.lead_id)
    if (touch && new Date(meeting.meeting_date).getTime() >= touch.at) {
      rows.find((row) => row.key === touch.channel)!.meetings++
    }
  }
  return rows.map((row) => ({ ...row, per100: per100(row.meetings, row.contacted) }))
}

function per100(meetings: number, contacted: number): number | null {
  return contacted > 0 ? (meetings / contacted) * 100 : null
}

export function buildResults(data: ResultsData, range: ResultsRange): Results {
  // Your own test addresses would skew the numbers
  const allEmails = data.emails.filter((email) => !isOwnAddress(email.address))
  const allCalls = data.calls.filter((call) => !isOwnAddress(call.address))

  const emails = allEmails.filter((email) => inRange(email.sent_at, range))
  const replied = emails.filter(isRealReply).length
  const bounced = emails.filter((email) => email.bounced_at).length
  const channels = channelRows(firstTouches(allEmails, allCalls), data.meetings, range)
  const contacted = channels.reduce((sum, row) => sum + row.contacted, 0)
  const meetings = channels.reduce((sum, row) => sum + row.meetings, 0)

  return {
    emailed: emails.length,
    replied,
    replyRate: rate(replied, emails.length),
    bounced,
    bounceRate: rate(bounced, emails.length),
    unsubscribed: emails.filter((email) => email.unsubscribed_at).length,
    replyLabels: replyLabelRows(emails),
    placement: placementRows(data.seedCopies, range),
    contacted,
    meetings,
    per100: per100(meetings, contacted),
    channels,
    byIndustry: breakdown(emails, (email) => email.vertical ?? NOT_SET, industryLabel),
    byHook: breakdown(emails, (email) => email.primary_hook ?? NOT_SET, hookLabel),
  }
}
