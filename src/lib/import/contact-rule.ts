import { normalizeBusinessName } from '@/lib/outreach/sourcing'

// A new lead needs at least two of: a contact name, an email, a company.
// The name only counts when it isn't just the company name repeated (Google
// leads use the business name as the contact), so a bare business name with
// nothing else is not enough.

export const MIN_CONTACT_FIELDS = 2

export const CONTACT_RULE_MESSAGE =
  'Add at least two of: a contact name (not just the company name), an email, a company'

interface ContactFields {
  contact_name?: unknown
  company_name?: unknown
  email?: unknown
}

function text(value: unknown): string {
  return String(value ?? '').trim()
}

function sameBusiness(name: string, company: string): boolean {
  const a = normalizeBusinessName(name).join(' ')
  const b = normalizeBusinessName(company).join(' ')
  return name.toLowerCase() === company.toLowerCase() || (a !== '' && a === b)
}

export function contactFieldsPresent(lead: ContactFields): ('name' | 'email' | 'company')[] {
  const name = text(lead.contact_name)
  const company = text(lead.company_name)
  const present: ('name' | 'email' | 'company')[] = []
  if (name && !(company && sameBusiness(name, company))) present.push('name')
  if (text(lead.email)) present.push('email')
  if (company) present.push('company')
  return present
}

export function hasEnoughContactInfo(lead: ContactFields): boolean {
  return contactFieldsPresent(lead).length >= MIN_CONTACT_FIELDS
}

// The database needs a contact name. With an email and a company but no
// person, the company stands in, as it does for Google leads.
export function contactNameFor(lead: ContactFields): string {
  return text(lead.contact_name) || text(lead.company_name)
}
