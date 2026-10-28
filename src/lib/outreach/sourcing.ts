import type { LeadInsert } from '@/types/database'
import type { LeadSignals } from './scoring'

// Google Places API (New) Text Search. Phone, website and rating are in the
// Enterprise SKU; reviews (Enterprise + Atmosphere) are fetched separately
// later, only for leads that survive dedupe.
const PLACES_SEARCH_URL = 'https://places.googleapis.com/v1/places:searchText'
const PLACES_PAGE_SIZE = 20
export const PLACES_MAX_RESULTS = 60

const PLACES_FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.addressComponents',
  'places.businessStatus',
  'places.nationalPhoneNumber',
  'places.websiteUri',
  'places.rating',
  'places.userRatingCount',
  'nextPageToken',
].join(',')

interface PlaceAddressComponent {
  longText?: string
  shortText?: string
  types?: string[]
}

export interface Place {
  id: string
  displayName?: { text?: string }
  formattedAddress?: string
  addressComponents?: PlaceAddressComponent[]
  businessStatus?: 'OPERATIONAL' | 'CLOSED_TEMPORARILY' | 'CLOSED_PERMANENTLY'
  nationalPhoneNumber?: string
  websiteUri?: string
  rating?: number
  userRatingCount?: number
}

// What /api/outreach/source returns
export interface SourceLeadsResult {
  found: number
  added: number
  duplicates: number
  closed: number
  overCap: number
  stageName: string
}

export class PlacesError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
  }
}

export async function searchPlaces({
  apiKey,
  textQuery,
  regionCode,
  maxResults,
}: {
  apiKey: string
  textQuery: string
  regionCode?: string
  maxResults: number
}): Promise<Place[]> {
  const limit = Math.min(Math.max(maxResults, 1), PLACES_MAX_RESULTS)
  const places: Place[] = []
  let pageToken: string | undefined

  // Every page must repeat the same query; only pageSize/pageToken may change
  while (places.length < limit) {
    const response = await fetch(PLACES_SEARCH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': PLACES_FIELD_MASK,
      },
      body: JSON.stringify({
        textQuery,
        regionCode,
        pageSize: Math.min(PLACES_PAGE_SIZE, limit - places.length),
        pageToken,
      }),
      signal: AbortSignal.timeout(15_000),
    })

    const body = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new PlacesError(
        body?.error?.message || `Google Places returned ${response.status}`,
        response.status
      )
    }

    places.push(...((body.places as Place[] | undefined) ?? []))
    pageToken = body.nextPageToken
    if (!pageToken) break
  }

  return places.slice(0, limit)
}

// Hosts many unrelated businesses share; a profile here is not a real website
const SHARED_HOSTS = [
  'facebook.com',
  'instagram.com',
  'linktr.ee',
  'business.site',
  'sites.google.com',
  'g.page',
  'yelp.com',
  'yelp.ca',
  'homestars.com',
  'houzz.com',
  'kijiji.ca',
]

export function websiteHost(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    const host = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname
    return host.toLowerCase().replace(/^www\./, '') || null
  } catch {
    return null
  }
}

function isSharedHost(host: string): boolean {
  return SHARED_HOSTS.some((shared) => host === shared || host.endsWith(`.${shared}`))
}

// Last 10 digits, so "+1 (613) 555-0100" and "613-555-0100" match
export function phoneDigits(phone: string | null | undefined): string | null {
  const digits = phone?.replace(/\D/g, '') ?? ''
  return digits.length >= 7 ? digits.slice(-10) : null
}

function addressPart(place: Place, type: string, short = false): string | null {
  const part = place.addressComponents?.find((c) => c.types?.includes(type))
  return (short ? part?.shortText : part?.longText) || null
}

export type CandidateLead = Omit<LeadInsert, 'stage_id' | 'position_index'> & {
  google_place_id: string
}

export function placeToCandidate(place: Place, vertical: string, now: Date): CandidateLead {
  const name = place.displayName?.text?.trim() || 'Unknown business'
  const host = websiteHost(place.websiteUri)
  const country = addressPart(place, 'country', true)
  const signals: LeadSignals = {
    checked_at: now.toISOString(),
    // A Facebook page or directory listing counts as having no site
    ...(!host || isSharedHost(host) ? { no_site: true } : {}),
  }

  return {
    google_place_id: place.id,
    company_name: name,
    // Replaced by the owner's name once the audit finds it
    contact_name: name,
    phone: place.nationalPhoneNumber || null,
    website: place.websiteUri || null,
    city:
      addressPart(place, 'locality') ||
      addressPart(place, 'postal_town') ||
      addressPart(place, 'sublocality'),
    region: addressPart(place, 'administrative_area_level_1', true),
    country: country && /^[A-Z]{2}$/i.test(country) ? country.toUpperCase() : null,
    vertical,
    google_rating: place.rating ?? null,
    google_review_count: place.userRatingCount ?? null,
    lead_source: 'places',
    signals: signals as Record<string, string | boolean>,
    notes: place.formattedAddress ? `Address: ${place.formattedAddress}` : null,
  }
}

export interface ExistingContacts {
  placeIds: Set<string>
  hosts: Set<string>
  phones: Set<string>
}

export interface DedupeResult {
  fresh: CandidateLead[]
  duplicates: CandidateLead[]
}

// Matches on place id, then website host (unless shared), then phone.
// Also catches repeats within the same batch.
export function dedupeCandidates(
  candidates: CandidateLead[],
  existing: ExistingContacts
): DedupeResult {
  const placeIds = new Set(existing.placeIds)
  const hosts = new Set(existing.hosts)
  const phones = new Set(existing.phones)
  const result: DedupeResult = { fresh: [], duplicates: [] }

  for (const candidate of candidates) {
    const host = websiteHost(candidate.website)
    const ownHost = host && !isSharedHost(host) ? host : null
    const phone = phoneDigits(candidate.phone)

    const duplicate =
      placeIds.has(candidate.google_place_id) ||
      (ownHost !== null && hosts.has(ownHost)) ||
      (phone !== null && phones.has(phone))

    if (duplicate) {
      result.duplicates.push(candidate)
      continue
    }

    result.fresh.push(candidate)
    placeIds.add(candidate.google_place_id)
    if (ownHost) hosts.add(ownHost)
    if (phone) phones.add(phone)
  }

  return result
}

export function existingContactsFrom(
  rows: { google_place_id: string | null; website: string | null; phone: string | null }[]
): ExistingContacts {
  const existing: ExistingContacts = { placeIds: new Set(), hosts: new Set(), phones: new Set() }
  for (const row of rows) {
    if (row.google_place_id) existing.placeIds.add(row.google_place_id)
    const host = websiteHost(row.website)
    if (host && !isSharedHost(host)) existing.hosts.add(host)
    const phone = phoneDigits(row.phone)
    if (phone) existing.phones.add(phone)
  }
  return existing
}
