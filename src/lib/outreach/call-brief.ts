import type { Lead } from '@/types/database'
import { PAIN_SIGNAL_LABELS, type LeadScore, type PainSignal } from './scoring'
import { auditFindings, parseAudit } from './audit-findings'

// One question per pain signal, asked in this order of preference
const CALL_QUESTIONS: [PainSignal, string][] = [
  ['slow_callback_reviews', "When you're out on a job, who picks up the phone?"],
  ['hiring', "What's the new office hire going to take off your plate?"],
  ['no_booking', 'How do customers ask you for a quote after hours?'],
  ['no_site', 'How do most new customers find you right now?'],
  ['dead_site', 'Did you know your website is down? How are people finding you meanwhile?'],
]

const DEFAULT_QUESTION =
  'How are you keeping track of jobs and quotes right now: a spreadsheet, texts, something else?'

export const CALL_OUTCOMES = [
  { value: 'no_answer', label: 'No answer' },
  { value: 'voicemail', label: 'Left voicemail' },
  { value: 'talked', label: 'Talked' },
  { value: 'not_interested', label: 'Not interested' },
  { value: 'meeting_booked', label: 'Meeting booked' },
] as const

export type CallOutcome = (typeof CALL_OUTCOMES)[number]['value']

type BriefLead = Pick<
  Lead,
  | 'contact_name'
  | 'company_name'
  | 'owner_name'
  | 'job_title'
  | 'phone'
  | 'city'
  | 'google_rating'
  | 'google_review_count'
  | 'audit'
>

export function callQuestion(painSignals: PainSignal[]): string {
  return CALL_QUESTIONS.find(([signal]) => painSignals.includes(signal))?.[1] ?? DEFAULT_QUESTION
}

function personToAskFor(lead: BriefLead): string {
  if (lead.owner_name) return lead.owner_name
  // Places leads use the business name as the contact until an owner is found
  if (lead.contact_name !== lead.company_name) {
    return lead.job_title ? `${lead.contact_name} (${lead.job_title})` : lead.contact_name
  }
  return 'Ask for the owner'
}

export function callTaskTitle(lead: BriefLead): string {
  const company = lead.company_name || lead.contact_name
  const person = lead.owner_name || (lead.contact_name !== company ? lead.contact_name : null)
  return person ? `Call ${person} at ${company}` : `Call ${company}`
}

// The one-screen brief saved as the call task's description
export function buildCallBrief(lead: BriefLead, score: LeadScore): string {
  const place = [lead.company_name || lead.contact_name, lead.city].filter(Boolean).join(', ')
  const rating =
    lead.google_rating != null
      ? ` · ${lead.google_rating}★ (${lead.google_review_count ?? 0} reviews)`
      : ''
  const pain = score.painSignals.length
    ? score.painSignals.map((signal) => PAIN_SIGNAL_LABELS[signal]).join('; ')
    : score.painChecked
      ? 'No pain signal found'
      : 'Not checked yet'

  const audit = parseAudit(lead.audit)
  const site = audit ? auditFindings(audit).slice(0, 3).join('; ') : null

  return [
    `Who: ${personToAskFor(lead)}`,
    `Business: ${place}${rating}`,
    `Phone: ${lead.phone ?? 'none'}`,
    `Pain: ${pain}`,
    ...(site ? [`Site: ${site}`] : []),
    `Ask: ${callQuestion(score.painSignals)}`,
    `Score: ${score.score}/${score.max}`,
  ].join('\n')
}
