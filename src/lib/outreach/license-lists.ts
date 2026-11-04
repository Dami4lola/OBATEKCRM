import type { LeadInsert } from '@/types/database'
import { soqlIn, type Row, type SoqlQuery } from './socrata-client'

// State real estate licence lists as a lead source (OUTREACH_PLAN.md §3):
// every licensed brokerage in the counties around the target cities, with
// the broker's name and, where the state links agents to their brokerage,
// a real office size. Official open data, no scraping. The queries go
// through an injected function, so this file stays pure and is tested
// with saved rows.

export type LicenseState = 'TX' | 'NY' | 'IL'
export const LIVE_LICENSE_STATES: LicenseState[] = ['TX', 'NY', 'IL']

export type LicenseLead = Omit<LeadInsert, 'stage_id' | 'position_index'> & { source_ref: string }

export type QueryFn = (domain: string, dataset: string, query: SoqlQuery) => Promise<Row[]>

export interface LicenseListOptions {
  counties: string[]
  staffRange: [number, number]
  // Newest licences first; otherwise the biggest small offices first
  newFirst: boolean
  now: Date
}

// A licence issued this recently is marked "Newly licensed"
const NEW_LICENSE_DAYS = 90

// A brokerage with no licensed agents is kept only if it manages
// property: its staff (leasing, maintenance) don't hold licences
const PROPERTY_MANAGER_NAME = /\b(management|mgmt|leasing|rentals?)\b/i

const UPPER_WORDS = new Set(['LLC', 'LP', 'LLP', 'PLLC', 'PC', 'II', 'III', 'IV', 'USA', 'NY', 'NYC', 'WNY', 'TX', 'IL', 'RE', 'DFW', 'ATX'])
const LOWER_WORDS = new Set(['and', 'of', 'the', 'at', 'in', 'for', 'de', 'la'])

// "DETOUR REALTY, LLC" -> "Detour Realty, LLC"
export function titleCase(text: string): string {
  return text
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .map((word, i) => {
      const bare = word.replace(/[^A-Za-z]/g, '').toUpperCase()
      if (UPPER_WORDS.has(bare)) return word.toUpperCase()
      const lower = word.toLowerCase()
      if (i > 0 && LOWER_WORDS.has(lower)) return lower
      // O'Brien, Smith-Jones, McDonald stay readable
      return lower
        .replace(/(^|[-'’/&(])([a-z])/g, (_, sep: string, ch: string) => sep + ch.toUpperCase())
        .replace(/^Mc([a-z])/, (_, ch: string) => `Mc${ch.toUpperCase()}`)
    })
    .join(' ')
}

// New York writes people "LAST FIRST MIDDLE"
export function reorderLastFirst(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length < 2) return titleCase(name)
  const [last, first] = parts
  return titleCase(`${first} ${last}`)
}

// "11/03/2026" -> Date (UTC), or null
export function parseUsDate(value: string | undefined): Date | null {
  const match = value?.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (!match) return null
  const date = new Date(Date.UTC(Number(match[3]), Number(match[1]) - 1, Number(match[2])))
  return Number.isNaN(date.getTime()) ? null : date
}

function isoDay(date: Date | null): string | null {
  return date ? date.toISOString().slice(0, 10) : null
}

function countyClause(counties: string[]): string {
  return soqlIn('upper(county)', counties.map((c) => c.toUpperCase()))
}

interface Candidate {
  lead: LicenseLead
  licensedAt: Date | null
}

function newLicenseNote(licensedAt: Date | null, now: Date): string | null {
  if (!licensedAt) return null
  const days = (now.getTime() - licensedAt.getTime()) / 86_400_000
  return days >= 0 && days <= NEW_LICENSE_DAYS ? 'Newly licensed' : null
}

function sortCandidates(candidates: Candidate[], newFirst: boolean): LicenseLead[] {
  return candidates
    .sort((a, b) => {
      if (newFirst) return (b.licensedAt?.getTime() ?? 0) - (a.licensedAt?.getTime() ?? 0)
      return (b.lead.staff_size ?? 0) - (a.lead.staff_size ?? 0)
    })
    .map((c) => c.lead)
}

function sizeOk(size: number | null, companyName: string, range: [number, number]): boolean {
  if (size === null) return PROPERTY_MANAGER_NAME.test(companyName)
  return size >= range[0] && size <= range[1]
}

function baseLead(state: LicenseState, company: string, sourceRef: string): LicenseLead {
  return {
    company_name: company,
    contact_name: company,
    region: state,
    country: 'US',
    vertical: 'property',
    lead_source: 'state_license',
    source_ref: sourceRef,
    signals: {},
  }
}

// ---------- Texas: TREC broker companies, designated broker, agent count ----------

const TX = { domain: 'data.texas.gov', dataset: 's7ft-44qi' }

async function texas(query: QueryFn, options: LicenseListOptions): Promise<LicenseLead[]> {
  const [companies, agentCounts] = await Promise.all([
    query(TX.domain, TX.dataset, {
      where: `license_type='Broker Company' AND status='Active' AND ${countyClause(options.counties)}`,
    }),
    // Agents per brokerage; brokerages missing here have none
    query(TX.domain, TX.dataset, {
      select: 'related_license_number, count(*) as agents',
      where: `license_type='Sales Agent' AND status='Active'`,
      group: 'related_license_number',
      order: 'related_license_number',
    }),
  ])
  const agents = new Map(agentCounts.map((row) => [row.related_license_number ?? '', Number(row.agents ?? 0)]))

  const candidates: Candidate[] = []
  for (const row of companies) {
    const license = row.license_number
    const name = row.full_name?.trim()
    if (!license || !name) continue
    const agentCount = agents.get(license) ?? 0
    // The designated broker counts too
    const size = agentCount > 0 ? agentCount + 1 : null
    if (!sizeOk(size, name, options.staffRange)) continue

    const company = titleCase(name)
    const broker =
      row.related_license_type === 'Broker Individual' && row.related_license_full_name?.trim()
        ? titleCase([row.related_license_full_name, row.related_license_suffix].filter(Boolean).join(' '))
        : null
    const licensedAt = parseUsDate(row.original_license_date)
    const lead = baseLead('TX', company, `TX-TREC:${license}`)
    lead.contact_name = broker ?? company
    lead.owner_name = broker
    lead.job_title = broker ? 'Designated broker' : null
    lead.staff_size = size
    lead.notes = [
      `Texas real estate licence ${license} (TREC)`,
      row.county ? `${row.county} County` : null,
      licensedAt ? `licensed ${isoDay(licensedAt)}` : null,
      size ? `${agentCount} licensed agent${agentCount === 1 ? '' : 's'}` : 'no licensed agents (property manager)',
      newLicenseNote(licensedAt, options.now),
    ]
      .filter(Boolean)
      .join(' · ')
    candidates.push({ lead, licensedAt })
  }
  return sortCandidates(candidates, options.newFirst)
}

// ---------- New York: DOS principal offices, broker, agents per office ----------

const NY = { domain: 'data.ny.gov', offices: 'nsde-gcv2', brokers: '9twf-9yig', salespersons: 'i8hd-gucs' }

// The principal broker, not associate brokers (who count as agents)
const NY_PRINCIPAL_BROKER = /^(CORPORATE|LIMITED LIABILITY|INDIVIDUAL|PARTNERSHIP|TRADENAME) BROKER$/

function nyKey(name: string | undefined, zip: string | undefined): string {
  return `${(name ?? '').trim().toUpperCase()}|${(zip ?? '').trim().slice(0, 5)}`
}

async function newYork(query: QueryFn, options: LicenseListOptions): Promise<LicenseLead[]> {
  const counties = countyClause(options.counties)
  const [offices, brokers, salespersons] = await Promise.all([
    query(NY.domain, NY.offices, { where: `license_type='REAL ESTATE PRINCIPAL OFFICE' AND ${counties}` }),
    query(NY.domain, NY.brokers, { where: counties }),
    query(NY.domain, NY.salespersons, {
      select: 'business_name, business_zip, count(*) as agents',
      where: counties,
      group: 'business_name, business_zip',
      order: 'business_name, business_zip',
    }),
  ])

  const principal = new Map<string, string>()
  const associates = new Map<string, number>()
  for (const row of brokers) {
    const key = nyKey(row.business_name, row.business_zip)
    if (NY_PRINCIPAL_BROKER.test(row.license_type ?? '') && row.license_holder_name && !principal.has(key)) {
      principal.set(key, reorderLastFirst(row.license_holder_name))
    } else if (row.license_type === 'ASSOCIATE BROKER') {
      associates.set(key, (associates.get(key) ?? 0) + 1)
    }
  }
  const agents = new Map(salespersons.map((row) => [nyKey(row.business_name, row.business_zip), Number(row.agents ?? 0)]))

  const candidates: Candidate[] = []
  const seen = new Set<string>()
  for (const row of offices) {
    const name = row.business_name?.trim()
    const license = row.license_number
    if (!name || !license || seen.has(license)) continue
    seen.add(license)
    const key = nyKey(row.business_name, row.business_zip)
    const agentCount = (agents.get(key) ?? 0) + (associates.get(key) ?? 0)
    const size = agentCount > 0 ? agentCount + 1 : null
    if (!sizeOk(size, name, options.staffRange)) continue

    const company = titleCase(name)
    const broker = principal.get(key) ?? null
    const lead = baseLead('NY', company, `NY-DOS:${license}`)
    lead.contact_name = broker ?? company
    lead.owner_name = broker
    lead.job_title = broker ? 'Broker' : null
    lead.staff_size = size
    lead.city = row.business_city ? titleCase(row.business_city) : null
    lead.notes = [
      `New York real estate office licence ${license} (DOS)`,
      [row.business_address_1, row.business_city, row.business_zip].filter(Boolean).map((p) => titleCase(p as string)).join(', ') || null,
      size ? `${agentCount} licensed agent${agentCount === 1 ? '' : 's'}` : 'no licensed agents (property manager)',
    ]
      .filter(Boolean)
      .join(' · ')
    candidates.push({ lead, licensedAt: null })
  }
  // New York's office list has no licence date
  return sortCandidates(candidates, false)
}

// ---------- Illinois: IDFPR licensed firms ----------

const IL = { domain: 'data.illinois.gov', dataset: 'pzzh-kp68' }
const IL_FIRMS = [
  'LICENSED REAL ESTATE BROKER CORPORATION',
  'LICENSED REAL ESTATE LIMITED LIABILITY FIRM',
  'LICENSED REAL ESTATE BROKER PARTNERSHIP',
]

async function illinois(query: QueryFn, options: LicenseListOptions): Promise<LicenseLead[]> {
  const rows = await query(IL.domain, IL.dataset, {
    where: `license_type='REAL ESTATE' AND license_status='ACTIVE' AND ${soqlIn('description', IL_FIRMS)} AND ${countyClause(options.counties)}`,
  })
  const candidates: Candidate[] = []
  const seen = new Set<string>()
  for (const row of rows) {
    const name = (row.businessdba?.trim() || row.business_name?.trim()) ?? ''
    const license = row.license_number
    if (!name || !license || seen.has(license)) continue
    seen.add(license)
    const company = titleCase(name)
    const licensedAt = parseUsDate(row.original_issue_date)
    const lead = baseLead('IL', company, `IL-IDFPR:${license}`)
    lead.city = row.city ? titleCase(row.city) : null
    // Illinois doesn't link agents to firms, so the size is unknown
    lead.staff_size = null
    lead.notes = [
      `Illinois real estate firm licence ${license} (IDFPR)`,
      row.business_name && row.businessdba ? `legal name ${titleCase(row.business_name)}` : null,
      licensedAt ? `licensed ${isoDay(licensedAt)}` : null,
      newLicenseNote(licensedAt, options.now),
    ]
      .filter(Boolean)
      .join(' · ')
    candidates.push({ lead, licensedAt })
  }
  return sortCandidates(candidates, options.newFirst)
}

const LOADERS: Record<LicenseState, (query: QueryFn, options: LicenseListOptions) => Promise<LicenseLead[]>> = {
  TX: texas,
  NY: newYork,
  IL: illinois,
}

// Every licensed brokerage in the counties that fits, best first
export function loadLicenseList(state: LicenseState, query: QueryFn, options: LicenseListOptions): Promise<LicenseLead[]> {
  return LOADERS[state](query, options)
}

// "Detour Realty, LLC" in TX -> "detour realty|TX": legal suffixes and
// punctuation don't make two brokerages different
export function companyKey(name: string | null | undefined, region: string | null | undefined): string | null {
  const bare = (name ?? '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\b(llc|l l c|inc|incorporated|corp|corporation|co|company|ltd|lp|llp|pllc|pc|the)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return bare ? `${bare}|${(region ?? '').trim().toUpperCase()}` : null
}

// What /api/outreach/licenses/import returns
export interface LicenseImportResult {
  found: number
  added: number
  already: number
  overCap: number
  stageName: string
}

export interface LicenseDedupe {
  fresh: LicenseLead[]
  already: number
}

// Drops licences already imported and companies already in the CRM in the
// same state, and repeats within the list
export function dedupeLicenseLeads(
  leads: LicenseLead[],
  existing: { sourceRefs: Set<string>; companies: { name: string | null; region: string | null }[] }
): LicenseDedupe {
  const refs = new Set(existing.sourceRefs)
  const names = new Set(existing.companies.map((c) => companyKey(c.name, c.region)).filter((k): k is string => !!k))
  const result: LicenseDedupe = { fresh: [], already: 0 }
  for (const lead of leads) {
    const key = companyKey(lead.company_name, lead.region)
    if (refs.has(lead.source_ref) || (key && names.has(key))) {
      result.already++
      continue
    }
    refs.add(lead.source_ref)
    if (key) names.add(key)
    result.fresh.push(lead)
  }
  return result
}
