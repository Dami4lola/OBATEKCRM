import { z } from 'zod'
import type { EmailSource } from '@/types/database'

export const EMAIL_SOURCES: { value: EmailSource; label: string }[] = [
  { value: 'website', label: 'Their website' },
  { value: 'lusha', label: 'Lusha' },
  { value: 'manual', label: 'Found manually' },
  { value: 'referral', label: 'Referral' },
  { value: 'other', label: 'Other' },
]

// Suggested values; vertical is free text so imported industries are kept
export const VERTICALS = [
  'hvac',
  'plumbing',
  'electrical',
  'roofing',
  'cleaning',
  'handyman',
  'landscaping',
  'fleet_trucking',
]

export const leadSchema = z.object({
  contact_name: z.string().min(1, 'Contact name is required'),
  company_name: z.string().optional(),
  email: z.union([z.string().email('Invalid email'), z.literal('')]).optional(),
  phone: z.string().optional(),
  value: z.number().min(0).nullable().optional(),
  payment_terms: z.enum(['one_time', 'monthly', 'hourly']).nullable().optional(),
  notes: z.string().optional(),
  stage_id: z.string().uuid('Invalid stage'),
  job_title: z.string().optional(),
  website: z.string().optional(),
  city: z.string().optional(),
  region: z.string().optional(),
  country: z
    .union([z.string().regex(/^[A-Za-z]{2}$/, 'Use a 2-letter code, e.g. CA'), z.literal('')])
    .optional(),
  vertical: z.string().optional(),
  staff_size: z.number().int().min(1).nullable().optional(),
  linkedin_url: z.union([z.string().url('Invalid URL'), z.literal('')]).optional(),
  email_source: z.enum(['website', 'lusha', 'manual', 'referral', 'other']).nullable().optional(),
})

export type LeadFormData = z.infer<typeof leadSchema>

// Form values use '' for empty text fields; the database wants null
export function leadFormToRow(data: LeadFormData) {
  return {
    ...data,
    value: data.value ?? null,
    payment_terms: data.payment_terms ?? null,
    email: data.email || null,
    phone: data.phone || null,
    company_name: data.company_name || null,
    notes: data.notes || null,
    job_title: data.job_title || null,
    website: data.website || null,
    city: data.city || null,
    region: data.region || null,
    country: data.country ? data.country.toUpperCase() : null,
    vertical: data.vertical || null,
    staff_size: data.staff_size ?? null,
    linkedin_url: data.linkedin_url || null,
    email_source: data.email_source ?? null,
  }
}

const COUNTRY_NAMES: Record<string, string> = {
  canada: 'CA',
  'united states': 'US',
  'united states of america': 'US',
  usa: 'US',
}

// "Canada" -> "CA"; anything unrecognised -> null (column is CHAR(2))
export function normalizeCountry(value: string): string | null {
  const trimmed = value.trim()
  if (/^[A-Za-z]{2}$/.test(trimmed)) return trimmed.toUpperCase()
  return COUNTRY_NAMES[trimmed.toLowerCase()] ?? null
}

const VERTICAL_KEYWORDS: [string, string[]][] = [
  ['hvac', ['hvac', 'heating', 'air conditioning', 'furnace']],
  ['plumbing', ['plumb']],
  ['electrical', ['electric']],
  ['roofing', ['roof']],
  ['cleaning', ['clean', 'janitor', 'maid']],
  ['handyman', ['handyman', 'home repair', 'home improvement', 'property maintenance']],
  ['landscaping', ['landscap', 'lawn']],
  ['fleet_trucking', ['truck', 'fleet', 'freight']],
]

// "Plumbing & Heating Contractors" -> "plumbing"; unknown industries kept as typed
export function normalizeVertical(value: string): string | null {
  const lower = value.trim().toLowerCase()
  if (!lower) return null
  const match = VERTICAL_KEYWORDS.find(([, words]) =>
    words.some((word) => lower.includes(word))
  )
  return match ? match[0] : lower
}

// "11-50" -> 50, "10,000+" -> 10000, "25" -> 25
export function parseStaffSize(value: string | number): number | null {
  if (typeof value === 'number') return value > 0 ? Math.round(value) : null
  const numbers = value.replace(/,/g, '').match(/\d+/g)
  if (!numbers) return null
  return Math.max(...numbers.map(Number))
}
