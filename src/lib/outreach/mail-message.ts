import type { OutreachEmailStep } from '@/types/database'

// What actually goes out: the approved step text plus the footer every
// email must carry (OUTREACH_PLAN.md §7). Plain text, no links, no tracking.

export const UNSUBSCRIBE_LINE = 'Not a fit? Reply STOP or "unsubscribe" and I won\'t email you again.'

export class MessageError extends Error {}

// CASL and CAN-SPAM: who's sending, a postal address, and a way to opt out
export function footer(senderName: string, mailingAddress: string | undefined): string {
  const name = senderName.trim()
  const address = mailingAddress?.trim()
  if (!name) throw new MessageError('sender_name is empty; every email needs the sender in its footer')
  if (!address) throw new MessageError('OBATEK_MAILING_ADDRESS is not set in .env.local; every email needs it in its footer')
  return `--\n${name} · OBATEK\n${address}\n${UNSUBSCRIBE_LINE}`
}

export function messageText(step: OutreachEmailStep, footerText: string): string {
  const body = step.body.trim()
  if (!body) throw new MessageError(`Email ${step.step} has no text`)
  return `${body}\n\n${footerText}`
}

export function messageSubject(step: OutreachEmailStep): string {
  const subject = step.subject.trim()
  if (!subject) throw new MessageError(`Email ${step.step} has no subject`)
  return subject
}
