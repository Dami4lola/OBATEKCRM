import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireTeamMember } from '@/lib/api/guards'
import { normalizeVertical } from '@/lib/validations/lead'
import {
  countLeadsSourcedSince,
  fetchExistingContacts,
  fetchSettings,
  findStageByName,
  pushLeads,
} from '@/lib/outreach/adapters/obatek-crm'
import {
  dedupeCandidates,
  placeToCandidate,
  PlacesError,
  PLACES_MAX_RESULTS,
  searchPlaces,
  type SourceLeadsResult,
} from '@/lib/outreach/sourcing'

const sourceSchema = z.object({
  query: z.string().trim().min(2).max(80),
  vertical: z.string().trim().min(1).max(50),
  city: z.string().trim().min(1).max(80),
  region: z.string().trim().max(50).optional(),
  country: z.string().trim().regex(/^[A-Za-z]{2}$/).default('CA'),
  maxResults: z.number().int().min(1).max(PLACES_MAX_RESULTS).default(20),
})

// Find leads: Google Places search -> dedupe -> append to the source stage
export async function POST(request: NextRequest) {
  try {
    const guard = await requireTeamMember()
    if (!guard.ok) return guard.response
    const { supabase } = guard

    const apiKey = process.env.GOOGLE_PLACES_API_KEY
    if (!apiKey) {
      return NextResponse.json(
        { error: 'GOOGLE_PLACES_API_KEY is not set in .env.local' },
        { status: 500 }
      )
    }

    const parsed = sourceSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ') },
        { status: 400 }
      )
    }
    const input = parsed.data

    const settings = await fetchSettings(supabase)
    const stage = await findStageByName(supabase, settings.source_stage_name)
    if (!stage) {
      return NextResponse.json(
        { error: `No pipeline stage named "${settings.source_stage_name}"` },
        { status: 400 }
      )
    }

    // Cost guard: a daily cap on new Places leads, counted since local midnight
    const startOfDay = new Date()
    startOfDay.setHours(0, 0, 0, 0)
    const addedToday = await countLeadsSourcedSince(supabase, startOfDay)
    const remainingToday = Math.max(settings.places_daily_lead_cap - addedToday, 0)
    if (remainingToday === 0) {
      return NextResponse.json(
        { error: `Daily limit of ${settings.places_daily_lead_cap} new leads reached. Try again tomorrow or raise places_daily_lead_cap.` },
        { status: 429 }
      )
    }

    const location = [input.city, input.region].filter(Boolean).join(', ')
    const places = await searchPlaces({
      apiKey,
      textQuery: `${input.query} in ${location}`,
      regionCode: input.country.toUpperCase(),
      maxResults: Math.min(input.maxResults, settings.places_max_results),
    })

    const open = places.filter((place) => place.businessStatus !== 'CLOSED_PERMANENTLY')
    const vertical = normalizeVertical(input.vertical) ?? input.vertical.toLowerCase()
    const now = new Date()
    const candidates = open.map((place) => placeToCandidate(place, vertical, now))

    const { fresh, duplicates } = dedupeCandidates(
      candidates,
      await fetchExistingContacts(supabase)
    )
    const toAdd = fresh.slice(0, remainingToday)
    const inserted = await pushLeads(supabase, stage.id, toAdd)

    const result: SourceLeadsResult = {
      found: places.length,
      added: inserted.length,
      duplicates: duplicates.length,
      closed: places.length - open.length,
      overCap: fresh.length - toAdd.length,
      stageName: stage.name,
    }
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof PlacesError) {
      return NextResponse.json(
        { error: `Google Places: ${error.message}` },
        { status: 502 }
      )
    }
    console.error('Lead sourcing error:', error)
    return NextResponse.json({ error: 'Failed to find leads' }, { status: 500 })
  }
}
