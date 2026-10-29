import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireTeamMember } from '@/lib/api/guards'
import {
  countSentSince,
  fetchLastSentAt,
  fetchLead,
  fetchOutreachEmail,
  fetchSettings,
  fetchSuppressions,
  findStageByName,
  logActivity,
  moveLeadToStage,
  updateOutreachEmail,
} from '@/lib/outreach/adapters/obatek-crm'
import { blockedReason, checkLead } from '@/lib/outreach/compliance'
import { createInstantlyLead, InstantlyError } from '@/lib/outreach/instantly-client'
import { campaignFor, instantlyVariables, type SendEmailResult } from '@/lib/outreach/sending'
import { firstName, parseSteps } from '@/lib/outreach/templates'

const sendSchema = z.object({
  emailId: z.string().uuid(),
})

// One approved email per request: re-check everything server-side, hand
// it to Instantly, log it, and move the lead to Contacted (§11)
export async function POST(request: NextRequest) {
  try {
    const guard = await requireTeamMember()
    if (!guard.ok) return guard.response
    const { supabase } = guard

    const parsed = sendSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json({ error: 'emailId must be a uuid' }, { status: 400 })
    }

    const apiKey = process.env.INSTANTLY_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'INSTANTLY_API_KEY is not set in .env.local' }, { status: 500 })
    }

    const settings = await fetchSettings(supabase)
    if (settings.sending_paused) {
      return NextResponse.json(
        { error: 'Sending is paused. Turn it on when warm-up is done (sending_paused).' },
        { status: 409 }
      )
    }

    const email = await fetchOutreachEmail(supabase, parsed.data.emailId)
    if (!email) return NextResponse.json({ error: 'Email not found' }, { status: 404 })
    if (email.status !== 'approved') {
      return NextResponse.json(
        { error: `This email is ${email.status}; only approved emails are sent` },
        { status: 409 }
      )
    }

    const lead = await fetchLead(supabase, email.lead_id)
    if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })

    // Cost and reputation guard, counted since local midnight
    const startOfDay = new Date()
    startOfDay.setHours(0, 0, 0, 0)
    if ((await countSentSince(supabase, startOfDay)) >= settings.daily_send_cap) {
      return NextResponse.json(
        { error: `Daily send cap of ${settings.daily_send_cap} reached. The rest stay approved for tomorrow.` },
        { status: 429 }
      )
    }

    // Compliance again, with fresh data: the browser's view may be stale
    const [suppressions, lastSentAt] = await Promise.all([
      fetchSuppressions(supabase),
      fetchLastSentAt(supabase, [lead.id]),
    ])
    const warnings = checkLead(lead, {
      suppressedEmails: suppressions.emails,
      suppressedDomains: suppressions.domains,
      lastSentAt,
      cooldownDays: settings.resequence_cooldown_days,
      now: new Date(),
    })
    const reason = blockedReason(warnings)
    if (reason) {
      const blocked = await updateOutreachEmail(supabase, email.id, {
        status: 'blocked',
        blocked_reason: reason,
      })
      const result: SendEmailResult = { email: blocked, outcome: 'blocked', message: reason }
      return NextResponse.json(result)
    }

    const fail = async (message: string) => {
      const failed = await updateOutreachEmail(supabase, email.id, { status: 'failed', last_error: message })
      const result: SendEmailResult = { email: failed, outcome: 'failed', message }
      return NextResponse.json(result)
    }

    const steps = parseSteps(email.steps)
    if (steps.length === 0 || !steps[0].body.trim()) return fail('The email has no text')

    const campaign = campaignFor(settings.instantly_campaigns, lead.vertical)
    if (!campaign) {
      return fail('No Instantly campaign set up. Add campaign IDs to instantly_campaigns ("default" at least).')
    }

    const target = await findStageByName(supabase, settings.target_stage_name)
    if (!target) return fail(`No pipeline stage named "${settings.target_stage_name}"`)

    let instantlyLeadId: string
    try {
      const created = await createInstantlyLead(apiKey, {
        campaign,
        email: lead.email!.trim(),
        first_name: firstName(lead) === 'there' ? null : firstName(lead),
        company_name: lead.company_name,
        website: lead.website,
        phone: lead.phone,
        custom_variables: instantlyVariables(steps, settings.instantly_body_format),
      })
      instantlyLeadId = created.id
    } catch (error) {
      if (error instanceof InstantlyError) {
        // Account-wide problems stop the batch; leave the email approved
        if ([401, 402, 429].includes(error.status)) {
          return NextResponse.json({ error: error.message }, { status: error.status === 429 ? 429 : 502 })
        }
        return fail(error.message)
      }
      throw error
    }

    const sentAt = new Date().toISOString()
    const sent = await updateOutreachEmail(supabase, email.id, {
      status: 'sent',
      sent_at: sentAt,
      instantly_campaign_id: campaign,
      instantly_lead_id: instantlyLeadId,
      last_error: null,
    })
    await logActivity(supabase, {
      lead_id: lead.id,
      type: 'email',
      title: 'Outreach email 1 queued in Instantly',
      description: steps[0].subject,
      meta: { channel: 'email', external_id: `outreach:${email.id}:queued`, run_id: email.run_id },
    })
    if (lead.stage_id !== target.id) await moveLeadToStage(supabase, lead.id, target.id)

    const result: SendEmailResult = { email: sent, outcome: 'sent', message: null }
    return NextResponse.json(result)
  } catch (error) {
    console.error('Send email error:', error)
    const message = error instanceof Error ? error.message : 'Failed to send'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
