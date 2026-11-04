import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireTeamMember } from '@/lib/api/guards'
import {
  countLeadsSourcedSince,
  fetchImportedKeys,
  fetchSettings,
  findStageByName,
  pushLeads,
} from '@/lib/outreach/adapters/obatek-crm'
import {
  dedupeLicenseLeads,
  loadLicenseList,
  type LicenseImportResult,
} from '@/lib/outreach/license-lists'
import { socrataQuery, SocrataError } from '@/lib/outreach/socrata-client'

const BodySchema = z.object({
  state: z.enum(['TX', 'NY', 'IL']),
  counties: z.array(z.string().min(1).max(60)).min(1).max(30),
  limit: z.number().int().min(1).max(200),
  newFirst: z.boolean().default(true),
})

// Find leads → State lists (§3): licensed brokerages from a state's open
// data, added to New. Capped per day like Google Maps sourcing.
export async function POST(request: Request) {
  try {
    const guard = await requireTeamMember()
    if (!guard.ok) return guard.response
    const { supabase } = guard

    const parsed = BodySchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    const { state, limit, newFirst } = parsed.data
    const settings = await fetchSettings(supabase)

    // Only the counties set up for this state
    const allowed = new Map((settings.license_counties[state] ?? []).map((c) => [c.toUpperCase(), c]))
    const counties = parsed.data.counties.map((c) => allowed.get(c.toUpperCase())).filter((c): c is string => !!c)
    if (counties.length === 0) return NextResponse.json({ error: 'Pick at least one county' }, { status: 400 })

    const stage = await findStageByName(supabase, settings.source_stage_name)
    if (!stage) {
      return NextResponse.json({ error: `No pipeline stage named "${settings.source_stage_name}"` }, { status: 400 })
    }

    const startOfDay = new Date()
    startOfDay.setHours(0, 0, 0, 0)
    const remaining = settings.license_daily_lead_cap - (await countLeadsSourcedSince(supabase, startOfDay, 'state_license'))
    if (remaining <= 0) {
      return NextResponse.json(
        { error: `Daily limit of ${settings.license_daily_lead_cap} licence-list leads reached. Try again tomorrow or raise license_daily_lead_cap.` },
        { status: 429 }
      )
    }

    const appToken = process.env.SOCRATA_APP_TOKEN || undefined
    const leads = await loadLicenseList(
      state,
      (domain, dataset, query) => socrataQuery(domain, dataset, query, appToken),
      { counties, staffRange: settings.staff_range.property ?? [2, 20], newFirst, now: new Date() }
    )
    const { fresh, already } = dedupeLicenseLeads(leads, await fetchImportedKeys(supabase))
    const take = Math.min(limit, remaining)
    const added = await pushLeads(supabase, stage.id, fresh.slice(0, take))

    const result: LicenseImportResult = {
      found: leads.length,
      added: added.length,
      already,
      overCap: Math.max(0, Math.min(fresh.length, limit) - take),
      stageName: stage.name,
    }
    return NextResponse.json(result)
  } catch (error) {
    console.error('Licence list import error:', error)
    const message = error instanceof SocrataError ? error.message : 'Failed to import the licence list'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
