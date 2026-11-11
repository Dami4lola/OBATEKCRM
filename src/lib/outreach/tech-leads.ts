import type { LeadSignalInsert } from '@/types/database'
import { normalizeVertical, VERTICALS } from '@/lib/validations/lead'
import type { TechTarget } from './settings'
import type { TechCompany } from './theirstack-client'
import { isSharedHost, websiteHost } from './sourcing'
import type { SignalLead } from './job-signals'

// Companies found by the software they use (OUTREACH_PLAN.md §3): small
// agencies on GoHighLevel, property managers on AppFolio or Buildium.
// TheirStack sees the tools in their job posts. Pure, tested offline.

export function companyDomain(company: TechCompany): string | null {
  const host = websiteHost(company.domain || company.url)
  return host && !isSharedHost(host) ? host : null
}

// The tracked tools this company uses, as the settings name them
export function toolsUsed(company: TechCompany, targets: TechTarget[]): TechTarget[] {
  const slugs = new Set([
    ...(company.technology_slugs ?? []),
    ...(company.technologies_found ?? []).map((t) => t?.technology?.slug).filter((s): s is string => !!s),
  ])
  return targets.filter((t) => slugs.has(t.slug))
}

// TheirStack's city filter matches text ("Charlotte" finds Charlottesville),
// so the city is checked exactly here
export function inTargetCities(company: TechCompany, cities: string[]): boolean {
  const city = company.city?.trim().toLowerCase()
  return !!city && cities.some((c) => c.toLowerCase() === city)
}

// Why a company returned by the search is skipped, or null to keep it
export function techSkipReason(company: TechCompany, cities: string[], staffRange: [number, number]): string | null {
  if (!companyDomain(company)) return 'No company website'
  if (company.is_recruiting_agency) return 'Staffing or recruiting firm'
  if (!inTargetCities(company, cities)) return `Outside the target cities (${company.city || 'city unknown'})`
  const staff = company.employee_count
  if (typeof staff === 'number' && (staff < staffRange[0] || staff > staffRange[1])) return `${staff} staff`
  return null
}

// Its industry decides when it names a known vertical (a roofer on
// GoHighLevel is a roofer); otherwise the tool's vertical
function verticalFor(company: TechCompany, tools: TechTarget[]): string | null {
  const fromIndustry = company.industry ? normalizeVertical(company.industry) : null
  if (fromIndustry && VERTICALS.includes(fromIndustry)) return fromIndustry
  return tools[0]?.vertical ?? null
}

export function techLabels(tools: TechTarget[]): string {
  return tools.map((t) => t.label).join(', ')
}

export function techCompanyToLead(company: TechCompany, tools: TechTarget[]): SignalLead {
  const domain = companyDomain(company)
  const name = company.name?.trim() || domain || 'Unknown company'
  return {
    company_name: name,
    contact_name: name,
    website: domain ? `https://${domain}` : null,
    linkedin_url: company.linkedin_url && /^https?:\/\//i.test(company.linkedin_url) ? company.linkedin_url : null,
    city: company.city?.trim() || null,
    country: company.country_code?.toUpperCase() || 'US',
    vertical: verticalFor(company, tools),
    staff_size: typeof company.employee_count === 'number' ? company.employee_count : null,
    lead_source: 'theirstack',
    signals: {},
    notes: `Uses ${techLabels(tools)} (seen in their job posts). Source: TheirStack.`,
  }
}

// One row per company returned: it cost 3 credits, so it's never bought again
export function techSignalRow(
  company: TechCompany,
  tools: TechTarget[],
  skip: string | null,
  now: Date
): LeadSignalInsert {
  const domain = companyDomain(company)
  return {
    source: 'theirstack',
    kind: 'technology',
    external_id: `company:${domain ?? company.name ?? 'unknown'}`,
    job_title: null,
    matched_term: techLabels(tools) || null,
    location: company.city ?? null,
    country_code: company.country_code?.toUpperCase() ?? null,
    company_name: company.name ?? null,
    company_domain: domain,
    company_linkedin_url: company.linkedin_url ?? null,
    employee_count: typeof company.employee_count === 'number' ? company.employee_count : null,
    industry: company.industry ?? null,
    fit: skip ? 'not_fit' : 'fit',
    fit_reason: skip ?? `Uses ${techLabels(tools)}`,
    fit_checked_at: now.toISOString(),
    status: skip ? 'discarded' : 'new',
  }
}

// What /api/outreach/software/search returns
export interface SoftwareSearchResult {
  // Companies TheirStack returned: 3 credits each
  returned: number
  added: number
  matched: number
  skipped: number
  skipReasons: string[]
  stageName: string
}
