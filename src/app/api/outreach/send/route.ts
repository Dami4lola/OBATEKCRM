import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireTeamMember } from '@/lib/api/guards'
import {
  fetchLastSentAt,
  fetchLead,
  fetchOutreachEmail,
  fetchSettings,
  fetchSuppressions,
  updateOutreachEmail,
} from '@/lib/outreach/adapters/obatek-crm'
import { blockedReason, checkLead } from '@/lib/outreach/compliance'
import type { SendEmailResult } from '@/lib/outreach/sending'
import { parseSteps } from '@/lib/outreach/templates'

const sendSchema = z.object({
  emailId: z.string().uuid(),
})

// One approved email per request: re-check it server-side, then queue it.
// The scheduler sends queued emails from the mailbox a few at a time,
// inside the send window and under the warm-up cap (§11).
export async function POST(request: NextRequest) {
  try {
    const guard = await requireTeamMember()
    if (!guard.ok) return guard.response
    const { supabase } = guard

    const parsed = sendSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json({ error: 'emailId must be a uuid' }, { status: 400 })
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
        { error: `This email is ${email.status}; only approved emails are queued` },
        { status: 409 }
      )
    }

    const lead = await fetchLead(supabase, email.lead_id)
    if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })

    // Compliance again, with fresh data: the browser's view may be stale.
    // The scheduler checks once more right before sending.
    const [suppressions, lastSentAt] = await Promise.all([
      fetchSuppressions(supabase),
      fetchLastSentAt(supabase, [lead.id]),
    ])
    const reason = blockedReason(
      checkLead(lead, {
        suppressedEmails: suppressions.emails,
        suppressedDomains: suppressions.domains,
        lastSentAt,
        cooldownDays: settings.resequence_cooldown_days,
        now: new Date(),
      })
    )
    if (reason) {
      const blocked = await updateOutreachEmail(supabase, email.id, { status: 'blocked', blocked_reason: reason })
      const result: SendEmailResult = { email: blocked, outcome: 'blocked', message: reason }
      return NextResponse.json(result)
    }

    const steps = parseSteps(email.steps)
    if (steps.length === 0 || !steps[0].body.trim() || !steps[0].subject.trim()) {
      const message = 'The email has no subject or text'
      const failed = await updateOutreachEmail(supabase, email.id, { status: 'failed', last_error: message })
      const result: SendEmailResult = { email: failed, outcome: 'failed', message }
      return NextResponse.json(result)
    }

    const queued = await updateOutreachEmail(supabase, email.id, {
      status: 'queued',
      queued_at: new Date().toISOString(),
      last_error: null,
    })
    const result: SendEmailResult = { email: queued, outcome: 'queued', message: null }
    return NextResponse.json(result)
  } catch (error) {
    console.error('Queue email error:', error)
    const message = error instanceof Error ? error.message : 'Failed to queue'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
