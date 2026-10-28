import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Lead, LeadUpdate } from '@/types/database'
import { findLeadIdByPlaceId, updateLead } from './adapters/obatek-crm'
import { auditSite, leadUpdatesFromAudit, type ListingInfo, type SiteAudit } from './audit'
import { fetchPlaceReviews, listingLeadUpdates, matchListing, searchPlaces } from './sourcing'

// The full site check for one lead: Google listing lookup (for a missing
// website), optional review scan, the audit itself, and saving the results.
// Shared by /api/outreach/audit and /api/outreach/prepare.

type Crm = SupabaseClient<Database>

export interface RunAuditOptions {
  checkReviews: boolean
  lookupListing: boolean
  placesKey: string | undefined
  pagespeedKey: string | undefined
}

interface WebsiteLookup {
  website: string | null
  noWebsiteConfirmed: boolean
  listing: ListingInfo | null
  placeId: string | null
  updates: LeadUpdate
  errors: string[]
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

async function lookUpWebsite(
  crm: Crm,
  lead: Lead,
  { enabled, apiKey }: { enabled: boolean; apiKey: string | undefined }
): Promise<WebsiteLookup> {
  const result: WebsiteLookup = {
    website: lead.website,
    noWebsiteConfirmed: false,
    listing: null,
    placeId: lead.google_place_id,
    updates: {},
    errors: [],
  }
  if (lead.website) return result

  // Sourced from Google Places: its listing had no website
  if (lead.google_place_id) {
    result.noWebsiteConfirmed = true
    return result
  }

  const company = lead.company_name?.trim()
  if (!enabled) result.errors.push('Website lookup skipped')
  else if (!apiKey) result.errors.push('Website lookup: GOOGLE_PLACES_API_KEY is not set')
  else if (!company) result.errors.push('Website lookup: no company name to search for')
  if (!enabled || !apiKey || !company) return result

  try {
    const places = await searchPlaces({
      apiKey,
      textQuery: [company, lead.city, lead.region].filter(Boolean).join(', '),
      regionCode: lead.country?.trim() || undefined,
      maxResults: 5,
    })
    const match = matchListing(
      lead,
      places.filter((place) => place.businessStatus !== 'CLOSED_PERMANENTLY')
    )
    if (!match) {
      result.errors.push('Website lookup: no matching Google listing')
      return result
    }

    const takenBy = await findLeadIdByPlaceId(crm, match.place.id)
    const savePlaceId = !takenBy || takenBy === lead.id
    if (!savePlaceId) result.errors.push('Same Google listing as another lead (possible duplicate)')

    result.updates = listingLeadUpdates(lead, match.place, { savePlaceId })
    result.listing = {
      place_id: match.place.id,
      name: match.place.displayName?.text ?? null,
      matched_on: match.matchedOn,
    }
    if (savePlaceId) result.placeId = match.place.id
    if (match.place.websiteUri) result.website = match.place.websiteUri
    else result.noWebsiteConfirmed = true
  } catch (error) {
    result.errors.push(`Website lookup: ${errorMessage(error)}`)
  }
  return result
}

export async function runLeadAudit(
  crm: Crm,
  lead: Lead,
  options: RunAuditOptions
): Promise<{ lead: Lead; audit: SiteAudit }> {
  const lookup = await lookUpWebsite(crm, lead, {
    enabled: options.lookupListing,
    apiKey: options.placesKey,
  })

  let reviews: string[] | null = null
  const reviewErrors: string[] = []
  if (options.checkReviews && lookup.placeId && options.placesKey) {
    try {
      reviews = await fetchPlaceReviews(options.placesKey, lookup.placeId)
    } catch (error) {
      reviewErrors.push(`Reviews: ${errorMessage(error)}`)
    }
  }

  const audit = await auditSite({
    website: lookup.website,
    city: lead.city,
    noWebsiteConfirmed: lookup.noWebsiteConfirmed,
    listing: lookup.listing,
    pagespeedKey: options.pagespeedKey,
    reviews,
  })
  audit.errors.push(...lookup.errors, ...reviewErrors)

  // Listing fields first (website, phone), then what the audit found
  const withListing = { ...lead, ...lookup.updates } as Lead
  const updated = await updateLead(crm, lead.id, {
    ...lookup.updates,
    ...leadUpdatesFromAudit(withListing, audit),
  })
  return { lead: updated, audit }
}
