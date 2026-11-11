import type { OutreachSettings } from './settings'

// When the engine may send, how much, and when each follow-up is due
// (OUTREACH_PLAN.md §11). Pure, so it's testable without the mailbox.
// Times are read in settings.send_timezone (America/Toronto).

interface LocalParts {
  year: number
  month: number // 1-12
  day: number
  weekday: number // 0 Sunday ... 6 Saturday
  minutes: number // since local midnight
}

const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }

export function localParts(date: Date, timeZone: string): LocalParts {
  const parts: Record<string, string> = {}
  for (const part of new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
    hour: 'numeric',
    minute: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(date)) {
    parts[part.type] = part.value
  }
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    weekday: WEEKDAYS[parts.weekday] ?? 0,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  }
}

// How far the zone is ahead of UTC at this moment, in ms
function zoneOffset(date: Date, timeZone: string): number {
  const p = localParts(date, timeZone)
  const asUtc = Date.UTC(p.year, p.month - 1, p.day) + p.minutes * 60_000
  return asUtc - Math.floor(date.getTime() / 60_000) * 60_000
}

// Local midnight of the day `date` falls on: the daily cap counts from here
export function startOfLocalDay(date: Date, timeZone: string): Date {
  const p = localParts(date, timeZone)
  const midnightAsUtc = Date.UTC(p.year, p.month - 1, p.day)
  return new Date(midnightAsUtc - zoneOffset(new Date(midnightAsUtc), timeZone))
}

function parseClock(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim())
  return match ? Number(match[1]) * 60 + Number(match[2]) : null
}

function isWeekend(weekday: number) {
  return weekday === 0 || weekday === 6
}

export function inSendWindow(now: Date, settings: Pick<OutreachSettings, 'send_window' | 'send_timezone'>): boolean {
  const { start, end, weekdays_only } = settings.send_window
  const p = localParts(now, settings.send_timezone)
  if (weekdays_only && isWeekend(p.weekday)) return false
  const from = parseClock(start) ?? 0
  const to = parseClock(end) ?? 24 * 60
  return p.minutes >= from && p.minutes < to
}

// `days` business days later, same clock time. A follow-up due outside the
// send window simply waits for the next window.
export function addBusinessDays(from: Date, days: number, timeZone: string): Date {
  let date = new Date(from)
  let left = Math.max(0, Math.round(days))
  while (left > 0) {
    date = new Date(date.getTime() + 86_400_000)
    if (!isWeekend(localParts(date, timeZone).weekday)) left--
  }
  return date
}

// When step `next` is due, given when the previous step went out
export function nextStepAt(sentAt: Date, next: 2 | 3, settings: Pick<OutreachSettings, 'followup_business_days' | 'send_timezone'>): Date {
  const gaps = settings.followup_business_days
  const gap = gaps[next - 2] ?? gaps[gaps.length - 1] ?? 3
  return addBusinessDays(sentAt, gap, settings.send_timezone)
}

// ---------- warm-up ----------

export interface DailyCap {
  cap: number
  // 1-based warm-up week, null before the first send
  week: number | null
  // Why the ramp isn't moving up, if it isn't
  held: string | null
}

const HOLD_BOUNCE_RATE = 0.02
const HOLD_MIN_SENDS = 10

// min(daily_send_cap, the ramp step for this week). The ramp moves up a
// step a week, but holds a step back while 7-day bounces are 2% or more,
// or the last seed-inbox check landed in spam.
export function effectiveDailyCap(
  settings: Pick<OutreachSettings, 'daily_send_cap' | 'send_ramp' | 'warmup_started_at'>,
  context: { sent7d: number; bounced7d: number; lastSeedSpam: boolean; now: Date }
): DailyCap {
  const ramp = settings.send_ramp.filter((n) => Number.isFinite(n) && n > 0)
  if (ramp.length === 0) return { cap: settings.daily_send_cap, week: null, held: null }

  const started = settings.warmup_started_at ? new Date(settings.warmup_started_at) : null
  const days = started && !Number.isNaN(started.getTime()) ? Math.max(0, (context.now.getTime() - started.getTime()) / 86_400_000) : 0
  const index = Math.min(Math.floor(days / 7), ramp.length - 1)

  let held: string | null = null
  if (context.sent7d >= HOLD_MIN_SENDS && context.bounced7d / context.sent7d >= HOLD_BOUNCE_RATE) {
    held = `bounces are ${Math.round((context.bounced7d / context.sent7d) * 100)}% this week (2% or more)`
  } else if (context.lastSeedSpam) {
    held = 'the last seed-inbox check landed in spam'
  }
  const step = held ? Math.max(0, index - 1) : index

  return {
    cap: Math.min(settings.daily_send_cap, ramp[step]),
    week: started ? index + 1 : null,
    held: held && index > 0 ? held : null,
  }
}

// Due follow-ups first (a thread already started), then new first emails
export function pickSends<F, Q>(dueFollowUps: F[], queued: Q[], limit: number): { followUps: F[]; firsts: Q[] } {
  const room = Math.max(0, limit)
  const followUps = dueFollowUps.slice(0, room)
  return { followUps, firsts: queued.slice(0, room - followUps.length) }
}

// Seed-inbox placement checks: daily for the first two weeks of warm-up,
// then weekly. One batch a day at most.
export function seedDue(
  now: Date,
  lastSeedAt: Date | null,
  settings: Pick<OutreachSettings, 'seed_addresses' | 'warmup_started_at' | 'send_timezone'>
): boolean {
  if (settings.seed_addresses.length === 0) return false
  if (!lastSeedAt) return true
  if (lastSeedAt >= startOfLocalDay(now, settings.send_timezone)) return false
  const started = settings.warmup_started_at ? new Date(settings.warmup_started_at) : now
  const warmupDays = (now.getTime() - started.getTime()) / 86_400_000
  return warmupDays < 14 || now.getTime() - lastSeedAt.getTime() >= 7 * 86_400_000
}
