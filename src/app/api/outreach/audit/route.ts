import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireTeamMember } from '@/lib/api/guards'
import {
  countLeadsAuditedSince,
  fetchLead,
  fetchSettings,
} from '@/lib/outreach/adapters/obatek-crm'
import { primaryHook, type AuditLeadResult } from '@/lib/outreach/audit-findings'
import { runLeadAudit } from '@/lib/outreach/run-audit'

const auditSchema = z.object({
  leadId: z.string().uuid(),
  checkReviews: z.boolean().default(false),
  lookupListing: z.boolean().default(true),
  force: z.boolean().default(false),
})

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
    const { lead: updated, audit } = await runLeadAudit(supabase, lead, {
      checkReviews,
      lookupListing,
      placesKey,
      pagespeedKey: process.env.PAGESPEED_API_KEY || placesKey,
    })
    const result: AuditLeadResult = { lead: updated, audit, hook: primaryHook(audit), skipped: null }
    return NextResponse.json(result)
  } catch (error) {
    console.error('Site audit error:', error)
    return NextResponse.json({ error: 'Failed to check the site' }, { status: 500 })
  }
}
