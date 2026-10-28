import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireTeamMember } from '@/lib/api/guards'
import {
  countLeadsAuditedSince,
  fetchLead,
  fetchSettings,
  findLeadIdByPlaceId,
  updateLead,
} from '@/lib/outreach/adapters/obatek-crm'
import {
  auditSite,
  leadUpdatesFromAudit,
  primaryHook,
  type AuditLeadResult,
  type ListingInfo,
} from '@/lib/outreach/audit'
import {
  fetchPlaceReviews,
  listingLeadUpdates,
  matchListing,
  searchPlaces,
} from '@/lib/outreach/sourcing'
import type { Lead, LeadUpdate } from '@/types/database'

const auditSchema = z.object({
  leadId: z.string().uuid(),
  checkReviews: z.boolean().default(false),
  lookupListing: z.boolean().default(true),
  force: z.boolean().default(false),
})

// Results of looking for a website the lead doesn't have on file
interface WebsiteLookup {
  website: string | null
  noWebsiteConfirmed: boolean
  listing: ListingInfo | null
  placeId: string | null
  updates: LeadUpdate
  errors: string[]
}

type Supabase = Extract<Awaited<ReturnType<typeof requireTeamMember>>, { ok: true }>['supabase']

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

async function lookUpWebsite(
  supabase: Supabase,
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

    const takenBy = await findLeadIdByPlaceId(supabase, match.place.id)
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

// One lead per request: PageSpeed alone can take 20-60 seconds
export async function POST(request: NextRequest) {
  try {
    const guard = await requireTeamMember()
    if (!guard.ok) return guard.response
    const { supabase } = guard

    const parsed = auditSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ') },
        { status: 400 }
      )
    }
    const { leadId, checkReviews, lookupListing, force } = parsed.data

    const [lead, settings] = await Promise.all([fetchLead(supabase, leadId), fetchSettings(supabase)])
    if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })

    const maxAgeMs = settings.audit_max_age_days * 86_400_000
    if (!force && lead.audited_at && Date.now() - new Date(lead.audited_at).getTime() < maxAgeMs) {
      const result: AuditLeadResult = { lead, audit: null, hook: null, skipped: 'recent' }
      return NextResponse.json(result)
    }

    // Cost guard, counted since local midnight
    const startOfDay = new Date()
    startOfDay.setHours(0, 0, 0, 0)
    if ((await countLeadsAuditedSince(supabase, startOfDay)) >= settings.audit_daily_cap) {
      return NextResponse.json(
        { error: `Daily limit of ${settings.audit_daily_cap} site checks reached. Try again tomorrow or raise audit_daily_cap.` },
        { status: 429 }
      )
    }

    const placesKey = process.env.GOOGLE_PLACES_API_KEY
    const lookup = await lookUpWebsite(supabase, lead, { enabled: lookupListing, apiKey: placesKey })

    let reviews: string[] | null = null
    const reviewErrors: string[] = []
    if (checkReviews && lookup.placeId && placesKey) {
      try {
        reviews = await fetchPlaceReviews(placesKey, lookup.placeId)
      } catch (error) {
        reviewErrors.push(`Reviews: ${errorMessage(error)}`)
      }
    }

    const audit = await auditSite({
      website: lookup.website,
      city: lead.city,
      noWebsiteConfirmed: lookup.noWebsiteConfirmed,
      listing: lookup.listing,
      pagespeedKey: process.env.PAGESPEED_API_KEY || placesKey,
      reviews,
    })
    audit.errors.push(...lookup.errors, ...reviewErrors)

    // Listing fields first (website, phone), then what the audit found
    const withListing = { ...lead, ...lookup.updates } as Lead
    const updated = await updateLead(supabase, lead.id, {
      ...lookup.updates,
      ...leadUpdatesFromAudit(withListing, audit),
    })
    const result: AuditLeadResult = { lead: updated, audit, hook: primaryHook(audit), skipped: null }
    return NextResponse.json(result)
  } catch (error) {
    console.error('Site audit error:', error)
    return NextResponse.json({ error: 'Failed to check the site' }, { status: 500 })
  }
}
