import type { LeadInsert, LeadSignal, LeadSignalInsert, Json, SignalTarget } from '@/types/database'
import { normalizeVertical } from '@/lib/validations/lead'
import type { OutreachSettings, SignalRegion } from './settings'
import type { JobPost } from './theirstack-client'
import { isSharedHost, websiteHost } from './sourcing'
import type { LeadSignals } from './scoring'

// Job posts as buying signals (OUTREACH_PLAN.md §3): which posts count,
// which to drop before paying for a fit check, and the lead a fit one
// becomes. Pure, so it's tested offline.

const EXCERPT_CHARS = 1200

export function regionRoles(settings: Pick<OutreachSettings, 'signal_roles'>, region: SignalRegion): string[] {
  return [...new Set([...settings.signal_roles, ...region.extra_roles])]
}

function escapeRegExp(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// The role a job title matches, as whole words; null when TheirStack's
// looser keyword match returned something else
export function matchRole(title: string | null | undefined, roles: string[]): string | null {
  if (!title) return null
  for (const role of roles) {
    if (new RegExp(`\\b${escapeRegExp(role)}s?\\b`, 'i').test(title)) return role
  }
  return null
}

function distanceKm(a: [number, number], b: [number, number]): number {
  const rad = (d: number) => (d * Math.PI) / 180
  const dLat = rad(b[0] - a[0])
  const dLon = rad(b[1] - a[1])
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLon / 2) ** 2
  return 6371 * 2 * Math.asin(Math.sqrt(h))
}

// A state for US regions; a city and radius elsewhere (Ottawa takes in
// Kanata, Nepean and Gatineau)
export function inRegion(job: JobPost, region: SignalRegion): boolean {
  if (job.country_code && job.country_code.toUpperCase() !== region.country.toUpperCase()) return false
  const text = [job.location, job.short_location, ...(job.cities ?? [])].filter(Boolean).join(' ').toLowerCase()
  return region.places.some((place) => {
    if (place.state_code) return job.state_code?.toUpperCase() === place.state_code.toUpperCase()
    if (place.near && typeof job.latitude === 'number' && typeof job.longitude === 'number') {
      return distanceKm(place.near, [job.latitude, job.longitude]) <= (place.radius_km ?? 50)
    }
    return text.includes(place.name.toLowerCase())
  })
}

// Job boards and social profiles aren't the company's own site
const JOB_HOSTS = ['linkedin.com', 'indeed.com', 'glassdoor.com', 'ziprecruiter.com', 'monster.com', 'workable.com', 'lever.co', 'greenhouse.io']

export function jobDomain(job: JobPost): string | null {
  const host = websiteHost(job.company_domain || job.company_object?.domain || job.company_object?.url)
  if (!host || isSharedHost(host)) return null
  return JOB_HOSTS.some((h) => host === h || host.endsWith(`.${h}`)) ? null : host
}

// Why a post is dropped before the fit check, or null to check it
export function prefilter(
  job: JobPost,
  region: SignalRegion,
  roles: string[],
  staffRange: [number, number]
): string | null {
  if (!jobDomain(job)) return 'No company website'
  if (job.company_object?.is_recruiting_agency) return 'Staffing or recruiting firm'
  const staff = job.company_object?.employee_count
  if (typeof staff === 'number' && (staff < staffRange[0] || staff > staffRange[1])) return `${staff} staff`
  if (!inRegion(job, region)) return 'Outside the target area'
  if (!matchRole(job.job_title, roles)) return "Job title isn't one of the signal roles"
  return null
}

// Plain text from the post's markdown or HTML, cut short: enough for the
// fit check and the email, not the whole post
export function jobExcerpt(description: string | null | undefined): string | null {
  if (!description) return null
  const text = description
    .replace(/<[^>]*>/g, ' ')
    .replace(/[#*_`>|]+/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
  return text ? text.slice(0, EXCERPT_CHARS) : null
}

function hiringTeam(job: JobPost): Json {
  return (job.hiring_team ?? [])
    .filter((person) => person?.full_name)
    .slice(0, 3)
    .map((person) => ({
      name: person.full_name ?? null,
      role: person.role ?? null,
      linkedin_url: person.linkedin_url && /^https:\/\/([a-z]+\.)?linkedin\.com\//i.test(person.linkedin_url) ? person.linkedin_url : null,
    }))
}

function httpUrl(url: string | null | undefined): string | null {
  return url && /^https?:\/\//i.test(url) ? url : null
}

// The row stored for every post returned; dropped ones are stored too so
// they're never paid for again
export function signalRow(job: JobPost, region: SignalRegion, roles: string[], staffRange: [number, number], now: Date): LeadSignalInsert {
  const dropped = prefilter(job, region, roles, staffRange)
  const company = job.company_object
  return {
    source: 'theirstack',
    external_id: String(job.id),
    kind: 'job_post',
    region: region.key,
    job_title: (job.job_title || 'Untitled job').slice(0, 300),
    matched_term: matchRole(job.job_title, roles),
    job_url: httpUrl(job.final_url) || httpUrl(job.url),
    posted_at: job.date_posted && /^\d{4}-\d{2}-\d{2}/.test(job.date_posted) ? job.date_posted.slice(0, 10) : null,
    location: job.short_location || job.location || null,
    state_code: job.state_code || null,
    country_code: job.country_code?.toUpperCase() || region.country,
    company_name: company?.name || job.company || null,
    company_domain: jobDomain(job),
    company_linkedin_url: httpUrl(company?.linkedin_url),
    employee_count: typeof company?.employee_count === 'number' ? company.employee_count : null,
    industry: company?.industry || null,
    hiring_team: hiringTeam(job),
    excerpt: jobExcerpt(job.description),
    ...(dropped
      ? { fit: 'not_fit' as const, fit_reason: dropped, fit_checked_at: now.toISOString(), status: 'discarded' as const }
      : {}),
  }
}

export interface HiringPerson {
  name: string
  role: string | null
  linkedin_url: string | null
}

export function parseHiringTeam(value: Json): HiringPerson[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return []
    const record = item as Record<string, Json | undefined>
    if (typeof record.name !== 'string') return []
    return [
      {
        name: record.name,
        role: typeof record.role === 'string' ? record.role : null,
        linkedin_url: typeof record.linkedin_url === 'string' ? record.linkedin_url : null,
      },
    ]
  })
}

// A trades company's name says more than its industry ("Acme Roofing",
// industry "Construction")
function verticalFor(target: SignalTarget | null, industry: string | null, company: string): string | null {
  if (target === 'agency') return 'agency'
  if (target === 'dealer') return 'car_dealer'
  if (target === 'trades') return normalizeVertical(`${company} ${industry ?? ''}`)
  return industry ? normalizeVertical(industry) : null
}

function cityFrom(location: string | null): string | null {
  const city = location?.split(',')[0]?.trim()
  return city || null
}

export type SignalLead = Omit<LeadInsert, 'stage_id' | 'position_index'>

// The lead a fit post becomes. The audit then finds the email and owner.
export function signalToLead(signal: LeadSignal): SignalLead {
  const company = signal.company_name || signal.company_domain || 'Unknown company'
  const person = parseHiringTeam(signal.hiring_team)[0]
  const signals: LeadSignals = { hiring: true }
  return {
    company_name: company,
    // The hiring manager if the post names one; the audit may find the owner
    contact_name: person?.name || company,
    job_title: person?.role || null,
    website: signal.company_domain ? `https://${signal.company_domain}` : null,
    linkedin_url: signal.company_linkedin_url,
    city: cityFrom(signal.location),
    region: signal.state_code,
    country: signal.country_code,
    vertical: verticalFor(signal.fit_target, signal.industry, company),
    staff_size: signal.employee_count,
    lead_source: 'theirstack',
    signals: signals as Record<string, boolean>,
    notes: `${signalTitle(signal)}. Source: TheirStack.`,
  }
}

export function signalTitle(signal: Pick<LeadSignal, 'job_title' | 'posted_at'>): string {
  return `Buying signal: job post for ${signal.job_title}${signal.posted_at ? ` (posted ${signal.posted_at})` : ''}`
}
