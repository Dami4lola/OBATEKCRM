import type { Json, Lead, LeadUpdate, OutreachHook } from '@/types/database'
import { parseSignals, type LeadSignals } from './scoring'
import type { SizeSignals } from './company-size'

// Audit results and what they mean, without the fetching (audit.ts), so
// browser code like the lead sheet can use them too

const OUTDATED_YEARS = 3

// found: a site of their own was on file or on their Google listing
// none_confirmed: their Google listing has none, or they only have a Facebook/directory page
// unknown: nothing on file and no Google listing matched, so we can't say
export type WebsiteStatus = 'found' | 'none_confirmed' | 'unknown'

export interface ListingInfo {
  place_id: string
  name: string | null
  matched_on: 'phone' | 'email_domain' | 'name_city'
}

export interface SiteAudit {
  audited_at: string
  input_url: string | null
  final_url: string | null
  has_site: boolean
  website_status: WebsiteStatus
  listing: ListingInfo | null // the Google listing matched during this check, if any
  dead_site: boolean
  https: boolean
  mobile_viewport: boolean | null
  perf_score: number | null
  copyright_year: number | null
  has_booking: boolean
  booking_tool: string | null
  has_contact_form: boolean
  emails_found: string[]
  owner_name: string | null
  seo_issues: string[]
  phone_on_homepage: boolean
  pages_checked: string[]
  slow_callback_reviews: string[] | null // matching review snippets; null = not checked
  size_signals?: SizeSignals // team-size wording on the site; missing on older audits
  errors: string[]
}

// What /api/outreach/audit returns
export interface AuditLeadResult {
  lead: Lead
  audit: SiteAudit | null
  hook: OutreachHook | null
  skipped: 'recent' | null
}

export const HOOK_LABELS: Record<OutreachHook, string> = {
  no_site: 'No real website',
  no_booking: 'No way to request a quote or book online',
  not_mobile: "Website doesn't work well on phones",
  slow: 'Website is slow on mobile',
  outdated: 'Website looks out of date',
  seo_local: "Website isn't set up to be found locally",
  generic: 'No obvious website problem',
}

export function parseAudit(value: Json | null | undefined): SiteAudit | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const audit = value as unknown as SiteAudit
  if (typeof audit.audited_at !== 'string' || typeof audit.has_site !== 'boolean') return null
  // Audits from before the Google lookup never confirmed a missing website
  if (!audit.website_status) {
    return { ...audit, website_status: audit.has_site ? 'found' : 'unknown', listing: null }
  }
  return audit
}

// No site of their own, and we're sure of it (dead sites count too)
export function hasNoSite(audit: SiteAudit): boolean {
  return audit.dead_site || audit.website_status === 'none_confirmed'
}

export function primaryHook(audit: SiteAudit, now = new Date()): OutreachHook {
  if (hasNoSite(audit)) return 'no_site'
  // Website unknown: never claim they don't have one
  if (!audit.has_site) return 'generic'
  // Unreadable homepage: don't claim problems we couldn't see
  if (audit.pages_checked.length === 0 || audit.mobile_viewport === null) return 'generic'
  if (!audit.has_booking && !audit.has_contact_form) return 'no_booking'
  if (!audit.mobile_viewport) return 'not_mobile'
  if (audit.perf_score !== null && audit.perf_score < 50) return 'slow'
  if (audit.copyright_year !== null && audit.copyright_year <= now.getFullYear() - OUTDATED_YEARS) {
    return 'outdated'
  }
  if (audit.seo_issues.length > 0) return 'seo_local'
  return 'generic'
}

// Pain signals for scoring, merged over what's already on the lead
export function auditSignals(audit: SiteAudit, existing: LeadSignals): LeadSignals {
  const readable = audit.has_site && !audit.dead_site && audit.mobile_viewport !== null
  const signals: LeadSignals = {
    ...existing,
    checked_at: audit.audited_at,
    no_site: audit.website_status === 'none_confirmed' || undefined,
    dead_site: audit.dead_site || undefined,
  }
  if (readable) signals.no_booking = (!audit.has_booking && !audit.has_contact_form) || undefined
  if (audit.slow_callback_reviews !== null) {
    signals.slow_callback_reviews = audit.slow_callback_reviews.length > 0 || undefined
  }
  // Drop false/undefined so the stored JSON only lists signals that apply
  return Object.fromEntries(
    Object.entries(signals).filter(([, value]) => value !== undefined && value !== false)
  ) as LeadSignals
}

// Plain-English findings for the lead sheet and call brief
export function auditFindings(audit: SiteAudit): string[] {
  const findings: string[] = []
  if (audit.website_status === 'unknown') {
    return ['Website unknown: none on file and no matching Google listing']
  }
  if (!audit.has_site) {
    return [audit.listing ? 'Google listing has no website' : 'No website of their own']
  }
  if (audit.dead_site) return ['Website is down or not found']
  if (audit.listing) findings.push('Website found on Google listing')
  if (audit.booking_tool) findings.push(`Books online with ${audit.booking_tool}`)
  else if (audit.has_booking) findings.push('Has a quote or booking button')
  else if (audit.has_contact_form) findings.push('Contact form only, no booking')
  else if (audit.mobile_viewport !== null) findings.push('No way to request a quote online')
  if (audit.mobile_viewport === false) findings.push('Not set up for phones')
  if (audit.perf_score !== null) findings.push(`Mobile speed ${audit.perf_score}/100`)
  if (audit.copyright_year !== null) findings.push(`Footer year ${audit.copyright_year}`)
  if (!audit.https) findings.push('No HTTPS')
  if (audit.emails_found.length) findings.push(`Email on site: ${audit.emails_found[0]}`)
  if (audit.owner_name) findings.push(`Owner (from site, unverified): ${audit.owner_name}`)
  findings.push(...audit.seo_issues)
  if (audit.slow_callback_reviews?.length) {
    findings.push(`${audit.slow_callback_reviews.length} review(s) mention slow callbacks`)
  }
  return findings
}

// What a finished audit changes on the lead. Only fills gaps: never
// overwrites an email or owner someone entered by hand.
export function leadUpdatesFromAudit(
  lead: Pick<Lead, 'email' | 'email_source' | 'owner_name' | 'contact_name' | 'company_name' | 'signals'>,
  audit: SiteAudit
): LeadUpdate {
  const updates: LeadUpdate = {
    audit: audit as unknown as Json,
    audited_at: audit.audited_at,
    signals: auditSignals(audit, parseSignals(lead.signals)) as Json,
  }

  const current = lead.email?.trim().toLowerCase()
  if (!current && audit.emails_found[0]) {
    updates.email = audit.emails_found[0]
    updates.email_source = 'website'
  } else if (current && audit.emails_found.includes(current) && lead.email_source !== 'website') {
    // The business publishes this address itself: the CASL basis (§7)
    updates.email_source = 'website'
  }

  if (!lead.owner_name && audit.owner_name) {
    updates.owner_name = audit.owner_name
    // Places leads start with the business name as the contact
    if (lead.contact_name === lead.company_name) updates.contact_name = audit.owner_name
  }

  return updates
}
