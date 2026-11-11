// TheirStack's job-posting API (OUTREACH_PLAN.md §3): small companies
// hiring for work OBATEK automates. Server only: the key is read by the
// routes. Its terms allow B2B prospecting; leads it supplies are tagged
// lead_source 'theirstack' and the data isn't passed on to anyone else.

const API = 'https://api.theirstack.com'

export class TheirStackError extends Error {
  constructor(
    message: string,
    readonly status: number,
    // Bad key or no credits left: later calls today would fail too
    readonly stopAll: boolean
  ) {
    super(message)
    this.name = 'TheirStackError'
  }
}

export interface JobHiringPerson {
  full_name?: string | null
  first_name?: string | null
  role?: string | null
  linkedin_url?: string | null
}

export interface JobCompany {
  name?: string | null
  domain?: string | null
  url?: string | null
  linkedin_url?: string | null
  employee_count?: number | null
  industry?: string | null
  is_recruiting_agency?: boolean | null
}

// The fields we use; everything is optional because the data is someone else's
export interface JobPost {
  id: number | string
  job_title?: string | null
  url?: string | null
  final_url?: string | null
  date_posted?: string | null
  description?: string | null
  location?: string | null
  short_location?: string | null
  state_code?: string | null
  country_code?: string | null
  cities?: string[] | null
  latitude?: number | null
  longitude?: number | null
  company?: string | null
  company_domain?: string | null
  company_object?: JobCompany | null
  hiring_team?: JobHiringPerson[] | null
}

export interface JobSearch {
  roles: string[]
  maxAgeDays: number
  countryCode: string
  locationIds: number[]
  staffRange: [number, number]
  skipDomains: string[]
  // Only posts TheirStack found after this (ISO), so none is bought twice
  discoveredSince: string | null
  limit: number
}

async function call(apiKey: string, path: string, init: RequestInit): Promise<unknown> {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', ...init.headers },
    // Filtered searches take TheirStack up to a minute or more
    signal: AbortSignal.timeout(170_000),
  })
  if (!response.ok) {
    const status = response.status
    const message =
      status === 401
        ? 'TheirStack rejected the API key (THEIRSTACK_API_KEY)'
        : status === 402 || status === 403
          ? 'TheirStack: no API credits left, or the plan does not include the API'
          : status === 429
            ? 'TheirStack: too many requests, try again later'
            : `TheirStack error ${status}`
    throw new TheirStackError(message, status, status === 401 || status === 402 || status === 403)
  }
  return response.json()
}

export function jobSearchBody(search: JobSearch): Record<string, unknown> {
  const body: Record<string, unknown> = {
    job_title_or: search.roles,
    posted_at_max_age_days: search.maxAgeDays,
    job_country_code_or: [search.countryCode],
    // Unknown sizes come back too; the fit check judges them
    min_employee_count_or_null: search.staffRange[0],
    max_employee_count_or_null: search.staffRange[1],
    // Staffing firms post for their clients
    company_type: 'direct_employer',
    limit: search.limit,
    page: 0,
  }
  if (search.locationIds.length) body.job_location_or = search.locationIds.map((id) => ({ id }))
  // Companies already seen recently: their posts would cost credits again
  if (search.skipDomains.length) body.company_domain_not = search.skipDomains
  if (search.discoveredSince) body.discovered_at_gte = search.discoveredSince
  return body
}

// 1 credit per job returned, so `limit` is the most a call can cost
export async function searchJobs(apiKey: string, search: JobSearch): Promise<JobPost[]> {
  if (search.limit <= 0 || search.roles.length === 0) return []
  const result = (await call(apiKey, '/v1/jobs/search', {
    method: 'POST',
    body: JSON.stringify(jobSearchBody(search)),
  })) as { data?: unknown }
  return Array.isArray(result.data) ? (result.data as JobPost[]).filter((job) => job && job.id != null) : []
}

interface CatalogLocation {
  id: number
  name?: string
  feature_code?: string
  admin1_name?: string
  country_code?: string
}

// A state ("Texas", US) or city ("Ottawa", CA) to TheirStack's location id,
// or null if the catalog doesn't know it. The catalog isn't billed per job.
export async function findLocationId(
  apiKey: string,
  name: string,
  countryCode: string,
  kind: 'state' | 'city'
): Promise<number | null> {
  const params = new URLSearchParams({ name, country_code: countryCode, limit: '10' })
  const result = await call(apiKey, `/v0/catalog/locations?${params.toString()}`, { method: 'GET' })
  const rows = (Array.isArray(result) ? result : []) as CatalogLocation[]
  const wanted = name.toLowerCase()
  const exact = rows.filter((row) => row.name?.toLowerCase() === wanted && typeof row.id === 'number')
  // GeoNames codes: ADM1 is a state or province, PPL* a populated place
  const preferred = exact.find((row) =>
    kind === 'state' ? row.feature_code === 'ADM1' : row.feature_code?.startsWith('PPL')
  )
  return (preferred ?? (kind === 'state' ? null : exact[0]))?.id ?? null
}

// ---------- Companies by the software they use (§3, stage 7.6b) ----------

export interface TechCompany {
  name?: string | null
  domain?: string | null
  url?: string | null
  linkedin_url?: string | null
  employee_count?: number | null
  city?: string | null
  country_code?: string | null
  industry?: string | null
  is_recruiting_agency?: boolean | null
  technology_slugs?: string[] | null
  technologies_found?: { technology?: { slug?: string | null; name?: string | null } | null }[] | null
}

export interface TechSearch {
  slugs: string[]
  cityPatterns: string[]
  staffRange: [number, number]
  skipDomains: string[]
  limit: number
}

export function techSearchBody(search: TechSearch): Record<string, unknown> {
  const body: Record<string, unknown> = {
    company_technology_slug_or: search.slugs,
    company_country_code_or: ['US'],
    // Known sizes only: 3 credits each is too much to spend on a giant
    min_employee_count: search.staffRange[0],
    max_employee_count: search.staffRange[1],
    expand_technology_slugs: search.slugs,
    limit: search.limit,
    page: 0,
  }
  if (search.cityPatterns.length) body.company_location_pattern_or = search.cityPatterns
  if (search.skipDomains.length) body.company_domain_not = search.skipDomains
  return body
}

// 3 credits per company returned, so `limit` caps the cost
export async function searchCompaniesByTech(apiKey: string, search: TechSearch): Promise<TechCompany[]> {
  if (search.limit <= 0 || search.slugs.length === 0) return []
  const result = (await call(apiKey, '/v1/companies/search', {
    method: 'POST',
    body: JSON.stringify(techSearchBody(search)),
  })) as { data?: unknown }
  return Array.isArray(result.data) ? (result.data as TechCompany[]).filter((c) => c && (c.domain || c.name)) : []
}
