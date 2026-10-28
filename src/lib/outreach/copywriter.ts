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

// Checks the draft against the copy rules; untrusted page text reaches the
// model, so nothing that fails here is used (§16 S3)
export function draftProblems(draft: { subject: string; opener: string }): string[] {
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
  if (/^(hi|hey|hello|dear)\b/i.test(opener)) problems.push('Opener repeats the greeting')
  return problems
}

// Untrusted text goes in as quoted data, trimmed and without markup
function quoted(text: string, max = 300): string {
  return text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)
}

function leadBrief({ lead, audit, hook, offer, examples }: DraftInput): string {
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
  lines.push('', 'Write the subject and opener for this lead.')
  return lines.filter((line) => line !== null).join('\n')
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
    system: [{ type: 'text', text: COPY_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
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
  let problems = draftProblems(attempt)
  if (problems.length) {
    attempt = await requestDraft(input, problems)
    problems = draftProblems(attempt)
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
