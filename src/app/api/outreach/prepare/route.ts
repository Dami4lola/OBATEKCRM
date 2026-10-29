import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireTeamMember } from '@/lib/api/guards'
import {
  countDraftsSince,
  fetchCopyExamples,
  fetchCopyRules,
  fetchLead,
  fetchOutreachEmail,
  fetchSettings,
  markRunAwaitingReview,
  saveCopyFeedback,
  updateOutreachEmail,
} from '@/lib/outreach/adapters/obatek-crm'
import { parseAudit, primaryHook } from '@/lib/outreach/audit-findings'
import { runLeadAudit } from '@/lib/outreach/run-audit'
import { draftWithClaude } from '@/lib/outreach/copywriter'
import {
  parseSteps,
  renderSteps,
  templateFor,
  templateVars,
  type PrepareEmailResult,
} from '@/lib/outreach/templates'
import type { Json } from '@/types/database'

const prepareSchema = z.object({
  emailId: z.string().uuid(),
  // Redraft with the team's feedback; remember = keep it as a writing rule
  feedback: z
    .object({
      note: z.string().trim().min(3, 'Feedback needs a few words').max(500, 'Keep feedback under 500 characters'),
      remember: z.boolean(),
      onlyVertical: z.boolean(),
      // What's on screen now, which may have unsaved edits
      subject: z.string().max(120).optional(),
      opener: z.string().max(600).optional(),
    })
    .optional(),
})

// One lead per request: refresh the site check if needed, then Claude
// drafts the subject + opener and the template is filled in (§8)
export async function POST(request: NextRequest) {
  try {
    const guard = await requireTeamMember()
    if (!guard.ok) return guard.response
    const { supabase } = guard

    const parsed = prepareSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid request' },
        { status: 400 }
      )
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: 'ANTHROPIC_API_KEY is not set in .env.local' },
        { status: 500 }
      )
    }

    const email = await fetchOutreachEmail(supabase, parsed.data.emailId)
    if (!email) return NextResponse.json({ error: 'Email not found' }, { status: 404 })
    if (email.status !== 'draft') {
      return NextResponse.json(
        { error: `This email is ${email.status}; only drafts can be redrafted` },
        { status: 409 }
      )
    }

    const [found, settings] = await Promise.all([
      fetchLead(supabase, email.lead_id),
      fetchSettings(supabase),
    ])
    if (!found) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
    let lead = found

    // Cost guard, counted since local midnight
    const startOfDay = new Date()
    startOfDay.setHours(0, 0, 0, 0)
    if ((await countDraftsSince(supabase, startOfDay)) >= settings.draft_daily_cap) {
      return NextResponse.json(
        { error: `Daily limit of ${settings.draft_daily_cap} Claude drafts reached. Try again tomorrow or raise draft_daily_cap.` },
        { status: 429 }
      )
    }

    let audit = parseAudit(lead.audit)
    const maxAgeMs = settings.audit_max_age_days * 86_400_000
    if (!audit || Date.now() - new Date(audit.audited_at).getTime() > maxAgeMs) {
      const placesKey = process.env.GOOGLE_PLACES_API_KEY
      const fresh = await runLeadAudit(supabase, lead, {
        checkReviews: false,
        lookupListing: true,
        placesKey,
        pagespeedKey: process.env.PAGESPEED_API_KEY || placesKey,
      })
      lead = fresh.lead
      audit = fresh.audit
    }
    const hook = audit ? primaryHook(audit) : 'generic'
    const { feedback } = parsed.data

    const [examples, rules] = await Promise.all([
      fetchCopyExamples(supabase, lead.vertical, settings.example_max_in_prompt),
      fetchCopyRules(supabase, lead.vertical),
    ])
    const draft = await draftWithClaude({
      model: settings.copy_model,
      lead,
      audit,
      hook,
      offer: settings.offer_description,
      examples,
      rules,
      revision: feedback && {
        subject: feedback.subject ?? parseSteps(email.steps)[0]?.subject ?? '',
        opener: feedback.opener ?? email.opener ?? '',
        feedback: feedback.note,
      },
    })

    // Saved once the redraft worked, so a retry doesn't store it twice
    if (feedback) {
      await saveCopyFeedback(supabase, {
        note: feedback.note,
        vertical: feedback.onlyVertical ? lead.vertical : null,
        active: feedback.remember,
        email_id: email.id,
      })
    }

    const template = templateFor(settings.email_templates, lead.vertical)
    const steps = renderSteps(
      template.steps,
      templateVars(lead, { opener: draft.opener, subject: draft.subject, senderName: settings.sender_name })
    )
    const updated = await updateOutreachEmail(supabase, email.id, {
      audit: (audit ?? {}) as unknown as Json,
      primary_hook: hook,
      opener: draft.opener || null,
      steps: steps as unknown as Json,
      // A rejected draft isn't Claude's; whatever Dami writes is "human"
      draft_steps: draft.problems.length ? null : (steps as unknown as Json),
      template_key: template.key,
      model: draft.model,
      author: draft.problems.length ? null : 'claude',
      drafted_at: new Date().toISOString(),
    })
    if (email.run_id) await markRunAwaitingReview(supabase, email.run_id)

    const result: PrepareEmailResult = { email: updated, lead, problems: draft.problems }
    return NextResponse.json(result)
  } catch (error) {
    console.error('Prepare email error:', error)
    const message = error instanceof Error ? error.message : 'Failed to draft the email'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
