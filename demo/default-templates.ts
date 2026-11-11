import type { TemplateStep } from '@/lib/outreach/settings'

// Sample wording for the public demo. demo/build.mjs swaps this in for
// src/lib/outreach/default-templates.ts, so the real wording never ships.

function sequence(pitch: string, ask: string): TemplateStep[] {
  return [
    {
      step: 1,
      subject: '{{subject}}',
      body: `Hi {{first_name}},\n\n{{opener}}\n\nI'm {{sender_first_name}} from Sample Automation Co. ${pitch}\n\n${ask}\n\n{{sender_name}}`,
    },
    {
      step: 2,
      subject: 're: {{subject}}',
      body: 'Hi {{first_name}},\n\nJust bringing this back to the top of your inbox. Happy to send it over if it would help {{company}}.\n\n{{sender_first_name}}',
    },
    {
      step: 3,
      subject: 're: {{subject}}',
      body: "Hi {{first_name}},\n\nI'll leave it here. If the timing is better later, just reply and I'll pick it up.\n\n{{sender_first_name}}",
    },
  ]
}

export const DEFAULT_EMAIL_TEMPLATES: Record<string, TemplateStep[]> = {
  default: sequence(
    'We help small trades businesses take bookings online and answer calls while the crew is on a job.',
    'Would a short review of how {{company}} handles new enquiries be useful?'
  ),
  agency: sequence(
    'We help small agencies follow up on every new inquiry the moment it arrives.',
    'Would a short review of how {{company}} handles new inquiries be useful?'
  ),
  property: sequence(
    'We help property managers and brokerages keep every lead, tenant and owner in one place.',
    'Would a short review of how {{company}} handles calls and inquiries be useful?'
  ),
}

export const DEFAULT_SENDER_NAME = 'Alex Morgan'
