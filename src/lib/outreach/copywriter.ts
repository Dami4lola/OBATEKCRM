import Anthropic from '@anthropic-ai/sdk'
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod'
import { z } from 'zod'
import type { Lead, OutreachHook } from '@/types/database'
import { auditFindings, HOOK_LABELS, type SiteAudit } from './audit-findings'
import { COPY_SYSTEM_PROMPT } from './prompts/copy-system'
import { firstName, wordCount } from './templates'

// Claude writes the subject and opening line for one lead (§8). Server only:
// it needs ANTHROPIC_API_KEY.

const DraftSchema = z.object({
  subject: z.string(),
  opener: z.string(),
})

export interface CopyExample {
  vertical: string | null
  subject: string
  opener: string
}

export interface DraftInput {
  model: string
  lead: Pick<Lead, 'company_name' | 'contact_name' | 'owner_name' | 'job_title' | 'city' | 'vertical' | 'google_rating' | 'google_review_count'>
  audit: SiteAudit | null
  hook: OutreachHook
  offer: string
  examples: CopyExample[]
  // Standing writing rules from the team (copy_feedback, active)
  rules: string[]
  // Redraft of an earlier draft with the team's feedback on it
  revision?: { subject: string; opener: string; feedback: string }
}

export interface Draft {
  subject: string
  opener: string
  model: string
  // Problems that made us discard Claude's text, if any
  problems: string[]
}

const CONTACT_DETAILS = /https?:\/\/|www\.|\b[\w.+-]+@[\w-]+\.[\w.]+|\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}/i
const BANNED_PHRASES = /hope (you|this)|came across|quick question|i love|amazing|!/i
// The site check misses forms that load later, so "you have no X" is often
// wrong and the owner knows it
const ABSENCE_CLAIM =
  /\bthere(?:'s|’s| is| are)\s+no\b|\bno way (?:to|for)\b|\b(?:doesn|don)(?:'|’)?t\s+have\b|\b(?:does|do) not\s+have\b|\b(?:can(?:'|’)?t|cannot|can not)\s+(?:book|request|get|schedule|find|reach)\b/i

// Checks the draft against the copy rules; untrusted page text reaches the
// model, so nothing that fails here is used (§16 S3)
export function draftProblems(
  draft: { subject: string; opener: string },
  { hook }: { hook?: OutreachHook } = {}
): string[] {
  const problems: string[] = []
  const subject = draft.subject.trim()
  const opener = draft.opener.trim()

  const subjectWords = wordCount(subject)
  if (subjectWords < 2 || subjectWords > 6) problems.push('Subject should be 2–5 words')
  if (subject.length > 60) problems.push('Subject is too long')
  if (CONTACT_DETAILS.test(subject) || /[!?]$/.test(subject)) problems.push('Subject has links, contact details or end punctuation')

  if (opener.length < 20) problems.push('Opener is too short')
  if (wordCount(opener) > 45 || opener.length > 320) problems.push('Opener is too long')
  if ((opener.match(/[.!?](\s|$)/g) ?? []).length > 2) problems.push('Opener has more than two sentences')
  if (CONTACT_DETAILS.test(opener)) problems.push('Opener has links or contact details')
  if (BANNED_PHRASES.test(opener)) problems.push('Opener uses a banned phrase')
  // A confirmed missing website is the one absence we can state
  if (hook !== 'no_site' && ABSENCE_CLAIM.test(opener)) {
    problems.push('Opener claims something is missing; describe what their current process costs them instead')
  }
  if (/^(hi|hey|hello|dear)\b/i.test(opener)) problems.push('Opener repeats the greeting')
  return problems
}

// Untrusted text goes in as quoted data, trimmed and without markup
function quoted(text: string, max = 300): string {
  return text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)
}

export function leadBrief({ lead, audit, hook, offer, examples, revision }: DraftInput): string {
  const findings = audit ? auditFindings(audit).filter((f) => !f.startsWith('Owner (from site')) : []
  const reviews = audit?.slow_callback_reviews ?? []
  const lines = [
    '<lead>',
    `Business: ${quoted(lead.company_name || lead.contact_name, 120)}`,
    `First name to greet: ${firstName(lead)}`,
    lead.job_title ? `Their role: ${quoted(lead.job_title, 80)}` : null,
    lead.city ? `City: ${quoted(lead.city, 60)}` : null,
    lead.vertical ? `Trade: ${lead.vertical.replace(/_/g, ' ')}` : null,
    lead.google_rating != null
      ? `Google rating: ${lead.google_rating} from ${lead.google_review_count ?? 0} reviews`
      : null,
    '</lead>',
    '',
    `<primary_angle>${HOOK_LABELS[hook]}</primary_angle>`,
    '',
    '<website_findings>',
    ...(findings.length ? findings.map((f) => `- ${quoted(f, 200)}`) : ['- No site check available']),
    '</website_findings>',
  ]
  if (reviews.length) {
    lines.push('', '<review_snippets>', ...reviews.map((r) => `- "${quoted(r, 200)}"`), '</review_snippets>')
  }
  if (offer.trim()) lines.push('', `<what_obatek_offers>${quoted(offer, 600)}</what_obatek_offers>`)
  if (examples.length) {
    lines.push(
      '',
      '<examples>',
      ...examples.map((e) => `- subject: "${quoted(e.subject, 80)}" | opener: "${quoted(e.opener, 320)}"`),
      '</examples>'
    )
  }
  if (revision) {
    lines.push(
      '',
      '<previous_draft>',
      `subject: ${quoted(revision.subject, 80)}`,
      `opener: ${quoted(revision.opener, 320)}`,
      '</previous_draft>',
      '',
      `<feedback_from_dami>${quoted(revision.feedback, 500)}</feedback_from_dami>`,
      '',
      'Rewrite the subject and opener for this lead using the feedback.'
    )
  } else {
    lines.push('', 'Write the subject and opener for this lead.')
  }
  return lines.filter((line) => line !== null).join('\n')
}

// The fixed prompt plus the team's standing rules. The cache breakpoint sits
// on the last block, so both are cached across a batch.
export function systemBlocks(rules: string[]): Anthropic.Beta.Messages.BetaTextBlockParam[] {
  const blocks: Anthropic.Beta.Messages.BetaTextBlockParam[] = [{ type: 'text', text: COPY_SYSTEM_PROMPT }]
  if (rules.length) {
    blocks.push({
      type: 'text',
      text: `Writing rules from Dami's team:\n${rules.map((rule) => `- ${quoted(rule, 500)}`).join('\n')}`,
    })
  }
  blocks[blocks.length - 1].cache_control = { type: 'ephemeral' }
  return blocks
}

let client: Anthropic | null = null
function anthropic() {
  // Reads ANTHROPIC_API_KEY from the environment
  client ??= new Anthropic()
  return client
}

async function requestDraft(input: DraftInput, feedback: string[]): Promise<{ subject: string; opener: string; model: string }> {
  const content = feedback.length
    ? `${leadBrief(input)}\n\nYour last attempt broke these rules: ${feedback.join('; ')}. Try again.`
    : leadBrief(input)

  const response = await anthropic().beta.messages.parse({
    model: input.model,
    max_tokens: 16000,
    // A declined request is retried on Anthropic's recommended fallback model
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: systemBlocks(input.rules),
    messages: [{ role: 'user', content }],
    output_config: { format: betaZodOutputFormat(DraftSchema), effort: 'medium' },
  })

  if (response.stop_reason === 'refusal') {
    throw new Error('Claude declined to write this draft')
  }
  if (!response.parsed_output) {
    throw new Error(`Claude returned no draft (stop reason: ${response.stop_reason})`)
  }
  return { ...response.parsed_output, model: response.model }
}

// One retry with the broken rules spelled out; after that the opener is
// left blank for Dami to write
export async function draftWithClaude(input: DraftInput): Promise<Draft> {
  let attempt = await requestDraft(input, [])
  let problems = draftProblems(attempt, input)
  if (problems.length) {
    attempt = await requestDraft(input, problems)
    problems = draftProblems(attempt, input)
  }
  if (problems.length) {
    return { subject: '', opener: '', model: attempt.model, problems }
  }
  return {
    subject: attempt.subject.trim().toLowerCase().replace(/[.!?]+$/, ''),
    opener: attempt.opener.trim(),
    model: attempt.model,
    problems: [],
  }
}
