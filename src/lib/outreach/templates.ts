import type { Json, Lead, OutreachEmail, OutreachEmailStep } from '@/types/database'
import type { TemplateStep } from './settings'

// Fills the fixed 3-email template (OUTREACH_PLAN.md §8). Browser-safe, so
// the Write step can show the rendered email as the opener is edited.

// What /api/outreach/prepare returns
export interface PrepareEmailResult {
  email: OutreachEmail
  lead: Lead
  // Rules Claude's draft broke; when set, the opener was left blank
  problems: string[]
}

export interface TemplateChoice {
  key: string
  steps: TemplateStep[]
}

export function templateFor(
  templates: Record<string, TemplateStep[]>,
  vertical: string | null
): TemplateChoice {
  if (vertical && templates[vertical]?.length) return { key: vertical, steps: templates[vertical] }
  return { key: 'default', steps: templates.default ?? [] }
}

type NamedLead = Pick<Lead, 'owner_name' | 'contact_name' | 'company_name'>

// "Robert Smith" -> "Robert"; a Places lead whose contact is still the
// business name gets "there"
export function firstName(lead: NamedLead): string {
  const person =
    lead.owner_name?.trim() ||
    (lead.contact_name && lead.contact_name !== lead.company_name ? lead.contact_name.trim() : '')
  const first = person.split(/\s+/)[0]
  return first && /^[A-Za-z][A-Za-z'-]*$/.test(first) ? first : 'there'
}

export interface TemplateVars {
  first_name: string
  company: string
  opener: string
  subject: string
  sender_name: string
  sender_first_name: string
}

export function templateVars(
  lead: NamedLead,
  { opener, subject, senderName }: { opener: string; subject: string; senderName: string }
): TemplateVars {
  return {
    first_name: firstName(lead),
    company: lead.company_name?.trim() || 'your business',
    opener: opener.trim(),
    subject: subject.trim(),
    sender_name: senderName,
    sender_first_name: senderName.split(/\s+/)[0] || senderName,
  }
}

function fill(text: string, vars: TemplateVars): string {
  return text
    .replace(/\{\{(\w+)\}\}/g, (match, name: string) =>
      name in vars ? vars[name as keyof TemplateVars] : match
    )
    // An empty opener would leave a gap
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function renderSteps(template: TemplateStep[], vars: TemplateVars): OutreachEmailStep[] {
  return template.map((step) => ({
    step: step.step,
    subject: fill(step.subject, vars),
    body: fill(step.body, vars),
  }))
}

export function parseSteps(value: Json | null | undefined): OutreachEmailStep[] {
  if (!Array.isArray(value)) return []
  return value.filter(
    (s): s is OutreachEmailStep & Json =>
      !!s && typeof s === 'object' && !Array.isArray(s) &&
      typeof (s as Record<string, unknown>).body === 'string' &&
      typeof (s as Record<string, unknown>).subject === 'string'
  ) as unknown as OutreachEmailStep[]
}

export function wordCount(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0
}

function sameSteps(a: OutreachEmailStep[], b: OutreachEmailStep[]): boolean {
  return (
    a.length === b.length &&
    a.every((step, i) => step.subject === b[i].subject && step.body === b[i].body)
  )
}

// Who wrote what was approved: the learning loop compares these (§9)
export function approvedAuthor(
  steps: OutreachEmailStep[],
  draftSteps: OutreachEmailStep[]
): 'human' | 'claude' | 'claude_edited' {
  if (draftSteps.length === 0) return 'human'
  return sameSteps(steps, draftSteps) ? 'claude' : 'claude_edited'
}
