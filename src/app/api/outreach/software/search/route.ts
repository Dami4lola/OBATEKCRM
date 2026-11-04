import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireTeamMember } from '@/lib/api/guards'
import {
  countTechSignalsSince,
  fetchExistingContacts,
  fetchRecentSignalDomains,
  fetchSettings,
  findLeadIdByHost,
  findStageByName,
  insertSignals,
  logActivity,
  pushLeads,
  updateSignal,
} from '@/lib/outreach/adapters/obatek-crm'
import { companyDomain, techCompanyToLead, techLabels, techSignalRow, techSkipReason, toolsUsed } from '@/lib/outreach/tech-leads'
import { searchCompaniesByTech, TheirStackError } from '@/lib/outreach/theirstack-client'
import { US_TARGET_METROS } from '@/lib/outreach/us-targets'
import type { SoftwareSearchResult } from '@/lib/outreach/tech-leads'

const BodySchema = z.object({
  slugs: z.array(z.string().min(1).max(60)).min(1).max(10),
  states: z.array(z.string().length(2)).min(1).max(10),
  limit: z.number().int().min(1).max(100),
})

// Companies seen before are left out of the search so they aren't paid for again
const SKIP_DOMAINS_MAX = 200

// Find leads → Software users (§3): small companies whose job posts show
// GoHighLevel or property management software. 3 TheirStack credits per
// company returned, capped per day by tech_daily_companies.
export async function POST(request: Request) {
  try {
    const guard = await requireTeamMember()
    if (!guard.ok) return guard.response
    const { supabase } = guard

    const apiKey = process.env.THEIRSTACK_API_KEY
    if (!apiKey) return NextResponse.json({ error: 'THEIRSTACK_API_KEY is not set in .env.local' }, { status: 400 })

    const parsed = BodySchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    const settings = await fetchSettings(supabase)

    // Only the tools and states set up in settings
    const targets = settings.tech_targets.filter((t) => parsed.data.slugs.includes(t.slug))
    const metros = US_TARGET_METROS.filter((m) => parsed.data.states.includes(m.state))
    if (targets.length === 0 || metros.length === 0) {
      return NextResponse.json({ error: 'Pick at least one tool and one state' }, { status: 400 })
    }
    const cities = metros.flatMap((m) => m.cities)

    const stage = await findStageByName(supabase, settings.source_stage_name)
    if (!stage) {
      return NextResponse.json({ error: `No pipeline stage named "${settings.source_stage_name}"` }, { status: 400 })
    }

    const startOfDay = new Date()
    startOfDay.setHours(0, 0, 0, 0)
    const remaining = settings.tech_daily_companies - (await countTechSignalsSince(supabase, startOfDay))
    if (remaining <= 0) {
      return NextResponse.json(
        { error: `Daily limit of ${settings.tech_daily_companies} companies reached. Try again tomorrow or raise tech_daily_companies.` },
        { status: 429 }
      )
    }

    const now = new Date()
    const companies = await searchCompaniesByTech(apiKey, {
      slugs: targets.map((t) => t.slug),
      cityPatterns: cities,
      staffRange: settings.staff_range.property ?? [2, 20],
      skipDomains: await fetchRecentSignalDomains(supabase, new Date(0), SKIP_DOMAINS_MAX),
      limit: Math.min(parsed.data.limit, remaining),
    })

    const existing = await fetchExistingContacts(supabase)
    const result: SoftwareSearchResult = {
      returned: companies.length,
      added: 0,
      matched: 0,
      skipped: 0,
      skipReasons: [],
      stageName: stage.name,
    }

    for (const company of companies) {
      const tools = toolsUsed(company, targets)
      const used = tools.length ? tools : targets
      const skip = techSkipReason(company, cities, settings.staff_range.property ?? [2, 20])
      const [signal] = await insertSignals(supabase, [techSignalRow(company, used, skip, now)])
      // Already stored: returned again despite the skip list
      if (!signal) continue
      if (skip) {
        result.skipped++
        if (result.skipReasons.length < 5) result.skipReasons.push(`${company.name ?? 'A company'}: ${skip}`)
        continue
      }

      const host = companyDomain(company)
      let leadId = host && existing.hosts.has(host) ? await findLeadIdByHost(supabase, host) : null
      if (leadId) {
        await updateSignal(supabase, signal.id, { lead_id: leadId, status: 'matched_existing' })
        result.matched++
      } else if (host && existing.hosts.has(host)) {
        // Deleted with Clean up before: leave it deleted
        await updateSignal(supabase, signal.id, { status: 'discarded', fit_reason: 'Deleted before with Clean up' })
        result.skipped++
        continue
      } else {
        const [lead] = await pushLeads(supabase, stage.id, [techCompanyToLead(company, used)])
        leadId = lead.id
        if (host) existing.hosts.add(host)
        await updateSignal(supabase, signal.id, { lead_id: leadId, status: 'lead_created' })
        result.added++
      }
      await logActivity(supabase, {
        lead_id: leadId,
        type: 'note',
        title: `Uses ${techLabels(used)}`,
        description: 'Seen in their job posts (TheirStack)',
        meta: { signal_id: signal.id, source: 'theirstack' },
      })
    }
    return NextResponse.json(result)
  } catch (error) {
    console.error('Software search error:', error)
    const message = error instanceof TheirStackError ? error.message : 'Failed to search for software users'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
