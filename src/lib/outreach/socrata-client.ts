// State open-data portals (Socrata): Texas TREC, New York DOS and Illinois
// IDFPR licence lists (OUTREACH_PLAN.md §3). Public data, no key needed;
// SOCRATA_APP_TOKEN, if set, lifts the shared rate limit. Server only.

// Socrata's largest page
const PAGE_LIMIT = 50_000
// A state's list is a few pages at most; stop runaway paging
const MAX_PAGES = 4

export class SocrataError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message)
    this.name = 'SocrataError'
  }
}

export interface SoqlQuery {
  select?: string
  where?: string
  group?: string
  having?: string
  order?: string
}

export type Row = Record<string, string | undefined>

// A string literal for SoQL: single quotes doubled
export function soqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

export function soqlIn(column: string, values: string[]): string {
  return `${column} in(${values.map(soqlString).join(',')})`
}

export function soqlUrl(domain: string, dataset: string, query: SoqlQuery, offset: number, limit: number): string {
  const params = new URLSearchParams()
  if (query.select) params.set('$select', query.select)
  if (query.where) params.set('$where', query.where)
  if (query.group) params.set('$group', query.group)
  if (query.having) params.set('$having', query.having)
  // Paging needs a stable order
  params.set('$order', query.order ?? ':id')
  params.set('$limit', String(limit))
  params.set('$offset', String(offset))
  return `https://${domain}/resource/${dataset}.json?${params.toString()}`
}

// Every row the query matches, paging as needed
export async function socrataQuery(
  domain: string,
  dataset: string,
  query: SoqlQuery,
  appToken?: string
): Promise<Row[]> {
  const rows: Row[] = []
  for (let page = 0; page < MAX_PAGES; page++) {
    const response = await fetch(soqlUrl(domain, dataset, query, page * PAGE_LIMIT, PAGE_LIMIT), {
      headers: appToken ? { 'X-App-Token': appToken } : {},
      signal: AbortSignal.timeout(90_000),
    })
    if (!response.ok) {
      throw new SocrataError(
        response.status === 429
          ? `${domain} is rate limiting requests; try again in a minute or set SOCRATA_APP_TOKEN`
          : `${domain} returned ${response.status}`,
        response.status
      )
    }
    const data = (await response.json()) as unknown
    if (!Array.isArray(data)) throw new SocrataError(`${domain} returned an unexpected response`, 502)
    rows.push(...(data as Row[]))
    if (data.length < PAGE_LIMIT) break
  }
  return rows
}
