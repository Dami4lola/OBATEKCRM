import type { Lead } from '@/types/database'
import { parseAudit } from './audit-findings'
import type { CompanySize } from './company-size'

// Shared inboxes rather than a person: info@, office@, bookings@...
export const GENERIC_EMAIL_PREFIXES = [
  'info', 'contact', 'contactus', 'office', 'hello', 'hi', 'admin', 'administration',
  'service', 'services', 'sales', 'support', 'help', 'inquiries', 'enquiries', 'inquiry',
  'enquiry', 'mail', 'email', 'team', 'quotes', 'quote', 'estimates', 'estimate',
  'booking', 'bookings', 'appointments', 'reception', 'general', 'customerservice',
  'customercare', 'marketing', 'webmaster', 'noreply', 'no-reply', 'dispatch', 'jobs',
]

export function isGenericEmail(email: string): boolean {
  const local = email.trim().toLowerCase().split('@')[0] ?? ''
  return GENERIC_EMAIL_PREFIXES.includes(local.replace(/[._-]?\d+$/, ''))
}

// Every address we know for the lead: the one on the lead plus any the
// site check found
export function knownEmails(lead: Pick<Lead, 'email' | 'audit'>): string[] {
  const emails = new Set<string>()
  if (lead.email?.trim()) emails.add(lead.email.trim().toLowerCase())
  for (const email of parseAudit(lead.audit)?.emails_found ?? []) emails.add(email.toLowerCase())
  return [...emails]
}

// True when we have emails but none of them reaches a person
export function hasOnlyGenericEmail(lead: Pick<Lead, 'email' | 'audit'>): boolean {
  const emails = knownEmails(lead)
  return emails.length > 0 && emails.every(isGenericEmail)
}

// Clean up's generic-email rule: only info@-style inboxes, a large company
// (where a shared inbox is screened), and not a strong lead. Small or
// unknown-size companies are kept: there info@ usually reaches the owner.
export function offeredByGenericRule({
  genericOnly,
  size,
  score,
  keepScore,
}: {
  genericOnly: boolean
  size: CompanySize
  score: number
  keepScore: number
}): boolean {
  return genericOnly && size.band === 'large' && score < keepScore
}
