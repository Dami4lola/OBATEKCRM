import type { OutreachEmail, OutreachEmailStep } from '@/types/database'

// Turning an approved email into what Instantly needs (§11). Pure, so it's
// testable without the API.

export type InstantlyBodyFormat = 'html' | 'text'

// What /api/outreach/send returns for one email
export interface SendEmailResult {
  email: OutreachEmail
  outcome: 'sent' | 'blocked' | 'failed'
  message: string | null
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// subject_1..3 and body_1..3 for the campaign's {{subject_1}} / {{body_1}}
// placeholders. HTML mode escapes the text (so a scraped company name or
// opener can't inject markup into our own email) and keeps line breaks.
export function instantlyVariables(
  steps: OutreachEmailStep[],
  format: InstantlyBodyFormat
): Record<string, string> {
  const variables: Record<string, string> = {}
  for (const step of steps) {
    variables[`subject_${step.step}`] = step.subject
    variables[`body_${step.step}`] =
      format === 'html' ? escapeHtml(step.body).replace(/\r?\n/g, '<br>') : step.body
  }
  return variables
}

// The campaign for the lead's vertical, else the default; null when
// neither is set up yet
export function campaignFor(campaigns: Record<string, string>, vertical: string | null): string | null {
  const id = (vertical && campaigns[vertical]) || campaigns.default
  return typeof id === 'string' && id.trim() ? id.trim() : null
}
