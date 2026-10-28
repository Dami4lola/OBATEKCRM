import type { Json, Lead } from '@/types/database'
import type { ScoreWeights } from './settings'

// Pain signals saved on leads.signals by sourcing (and, from stage 4, the audit)
export interface LeadSignals {
  checked_at?: string
  no_site?: boolean
  dead_site?: boolean
  no_booking?: boolean
  slow_callback_reviews?: boolean
  hiring?: boolean
}

export type PainSignal = Exclude<keyof LeadSignals, 'checked_at'>

export const PAIN_SIGNAL_LABELS: Record<PainSignal, string> = {
  no_site: 'No real website',
  dead_site: 'Website is down',
  no_booking: 'No online booking or quote form',
  slow_callback_reviews: 'Reviews mention slow callbacks',
  hiring: 'Hiring an office admin or dispatcher',
}

export interface ScoreReason {
  reason: string
  points: number
}

export interface LeadScore {
  score: number
  max: number
  breakdown: ScoreReason[]
  painSignals: PainSignal[]
  // False until sourcing or an audit has looked for pain signals
  painChecked: boolean
}

const OWNER_TITLE = /\b(owner|founder|co-?founder|president|principal|proprietor|ceo)\b/i

export function parseSignals(value: Json | null | undefined): LeadSignals {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const signals: LeadSignals = {}
  const record = value as Record<string, Json | undefined>
  if (typeof record.checked_at === 'string') signals.checked_at = record.checked_at
  for (const key of Object.keys(PAIN_SIGNAL_LABELS) as PainSignal[]) {
    if (record[key] === true) signals[key] = true
  }
  return signals
}

type ScoredLead = Pick<
  Lead,
  'staff_size' | 'job_title' | 'owner_name' | 'email' | 'phone' | 'vertical' | 'signals'
>

export function scoreLead(
  lead: ScoredLead,
  weights: ScoreWeights,
  targetVerticals: string[]
): LeadScore {
  const signals = parseSignals(lead.signals)
  const painSignals = (Object.keys(PAIN_SIGNAL_LABELS) as PainSignal[]).filter(
    (key) => signals[key]
  )
  const breakdown: ScoreReason[] = []

  // Counted once however many apply
  if (painSignals.length > 0) {
    breakdown.push({
      reason: painSignals.map((key) => PAIN_SIGNAL_LABELS[key]).join(', '),
      points: weights.pain_signal,
    })
  }

  if (lead.staff_size != null && lead.staff_size >= 2 && lead.staff_size <= 15) {
    breakdown.push({ reason: `${lead.staff_size} staff`, points: weights.staff_size })
  }

  const ownerByTitle = !!lead.job_title && OWNER_TITLE.test(lead.job_title)
  const ownerFound = !!lead.owner_name && !!(lead.email || lead.phone)
  if (ownerByTitle || ownerFound) {
    breakdown.push({ reason: 'Owner reachable directly', points: weights.owner_reachable })
  }

  if (lead.vertical && targetVerticals.includes(lead.vertical)) {
    breakdown.push({ reason: 'Target vertical', points: weights.target_vertical })
  }

  return {
    score: breakdown.reduce((sum, item) => sum + item.points, 0),
    max: weights.pain_signal + weights.staff_size + weights.owner_reachable + weights.target_vertical,
    breakdown,
    painSignals,
    painChecked: !!signals.checked_at,
  }
}

export function describeScore(score: LeadScore): string {
  if (score.breakdown.length === 0) {
    return score.painChecked ? 'No scoring signals yet' : 'Not checked for pain signals yet'
  }
  const lines = score.breakdown.map((item) => `+${item.points} ${item.reason}`)
  if (!score.painChecked) lines.push('Pain signals not checked yet')
  return lines.join('\n')
}
