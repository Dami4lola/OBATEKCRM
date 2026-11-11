import { normalizeBusinessName } from '@/lib/outreach/sourcing'
import type { ParsedRow } from './types'

// The duplicate check for imports. A row repeats a lead when its email
// matches, or when its name and company both match. Nothing else is compared,
// and name alone or company alone never counts.

export interface LeadKey {
  email: string | null
  contact_name: string | null
  company_name: string | null
}

export type DuplicateKind = 'existing' | 'file'

// Capitals, spaces and punctuation don't make a different person
export function cleanEmail(email: unknown): string | null {
  const text = String(email ?? '').trim().toLowerCase()
  return text || null
}

function cleanName(name: unknown): string | null {
  const text = String(name ?? '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
  return text || null
}

// "Bob's Handyman Services Inc." and "Bobs Handyman Services" are one company
function cleanCompany(company: unknown): string | null {
  return normalizeBusinessName(String(company ?? '')).join(' ') || null
}

interface Keys {
  email: string | null
  // Null unless both the name and the company are filled in
  pair: string | null
}

function keysOf(lead: LeadKey): Keys {
  const name = cleanName(lead.contact_name)
  const company = cleanCompany(lead.company_name)
  return { email: cleanEmail(lead.email), pair: name && company ? `${name}|${company}` : null }
}

class Seen {
  private emails = new Set<string>()
  private pairs = new Set<string>()

  has({ email, pair }: Keys): boolean {
    return (!!email && this.emails.has(email)) || (!!pair && this.pairs.has(pair))
  }

  add({ email, pair }: Keys) {
    if (email) this.emails.add(email)
    if (pair) this.pairs.add(pair)
  }
}

// One result per row, in order. Rows that failed validation aren't imported,
// so they neither count as duplicates nor hold a place for a later copy.
export function findDuplicates(rows: ParsedRow[], existing: LeadKey[]): (DuplicateKind | null)[] {
  const inCrm = new Seen()
  for (const lead of existing) inCrm.add(keysOf(lead))

  const inFile = new Seen()
  return rows.map((row) => {
    if (!row.isValid) return null
    const keys = keysOf({
      email: row.data.email as string | null,
      contact_name: row.data.contact_name as string | null,
      company_name: row.data.company_name as string | null,
    })
    if (inCrm.has(keys)) return 'existing'
    if (inFile.has(keys)) return 'file'
    inFile.add(keys)
    return null
  })
}

// The rows again, with `duplicate` set on the ones that won't be imported
export function markDuplicates(rows: ParsedRow[], existing: LeadKey[]): ParsedRow[] {
  const kinds = findDuplicates(rows, existing)
  return rows.map((row, index) => ({ ...row, duplicate: kinds[index] ?? undefined }))
}

export const DUPLICATE_REASONS: Record<DuplicateKind, string> = {
  existing: 'Already in your leads',
  file: 'Repeated in this file',
}
