import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json, LeadSignal } from '@/types/database'
import {
  countDraftsSince,
  fetchCopyExamples,
  fetchCopyRules,
  fetchLead,
  fetchOutreachEmail,
  fetchSettings,
  fetchSignalsForLead,
  markRunAwaitingReview,
  saveCopyFeedback,
  updateOutreachEmail,
} from './adapters/obatek-crm'
import { parseAudit, primaryHook } from './audit-findings'
import { draftWithClaude } from './copywriter'
import { runLeadAudit } from './run-audit'
import { parseSteps, renderSteps, templateFor, templateVars, type PrepareEmailResult } from './templates'

// One lead's draft: refresh the site check if needed, then Claude drafts the
// subject + opener and the template is filled in (§8). Used by
// /api/outreach/prepare (the Write step) and the scheduler's tick.

type Crm = SupabaseClient<Database>

// A job post older than this no longer leads the email
const SIGNAL_MAX_AGE_DAYS = 30

export class PrepareError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
  }
}

export interface PrepareFeedback {
  note: string
  remember: boolean
  onlyVertical: boolean
  // What's on screen now, which may have unsaved edits
  subject?: string
  opener?: string
}

export interface PrepareOptions {
  feedback?: PrepareFeedback
  placesKey: string | undefined
  pagespeedKey: string | undefined
}

export async function prepareEmail(
  crm: Crm,
  emailId: string,
  { feedback, placesKey, pagespeedKey }: PrepareOptions
): Promise<PrepareEmailResult> {
  const email = await fetchOutreachEmail(crm, emailId)
  if (!email) throw new PrepareError('Email not found', 404)
  if (email.status !== 'draft') {
    throw new PrepareError(`This email is ${email.status}; only drafts can be redrafted`, 409)
  }

  const [found, settings] = await Promise.all([fetchLead(crm, email.lead_id), fetchSettings(crm)])
  if (!found) throw new PrepareError('Lead not found', 404)
  let lead = found

  // Cost guard, counted since local midnight
  const startOfDay = new Date()
  startOfDay.setHours(0, 0, 0, 0)
  if ((await countDraftsSince(crm, startOfDay)) >= settings.draft_daily_cap) {
    throw new PrepareError(
      `Daily limit of ${settings.draft_daily_cap} Claude drafts reached. Try again tomorrow or raise draft_daily_cap.`,
      429
    )
  }

  let audit = parseAudit(lead.audit)
  const maxAgeMs = settings.audit_max_age_days * 86_400_000
  if (!audit || Date.now() - new Date(audit.audited_at).getTime() > maxAgeMs) {
    const fresh = await runLeadAudit(crm, lead, {
      checkReviews: false,
      lookupListing: true,
      placesKey,
      pagespeedKey,
    })
    lead = fresh.lead
    audit = fresh.audit
  }
  // A recent job post beats anything the site check found (§3)
  const signals = await fetchSignalsForLead(crm, lead.id, 10)
  const signal = signals.find(
    (s): s is LeadSignal & { job_title: string } =>
      s.kind === 'job_post' &&
      s.fit === 'fit' &&
      !!s.job_title &&
      Date.now() - new Date(s.created_at).getTime() <= SIGNAL_MAX_AGE_DAYS * 86_400_000
  )
  const hook = signal ? 'job_post' : audit ? primaryHook(audit, lead.vertical) : 'generic'
  // Software seen in their job posts ("AppFolio, Buildium")
  const software = [
    ...new Set(
      signals
        .filter((s) => s.kind === 'technology' && s.fit === 'fit' && s.matched_term)
        .flatMap((s) => (s.matched_term as string).split(', '))
    ),
  ]

  const [examples, rules] = await Promise.all([
    fetchCopyExamples(crm, lead.vertical, settings.example_max_in_prompt),
    fetchCopyRules(crm, lead.vertical),
  ])
  const draft = await draftWithClaude({
    model: settings.copy_model,
    lead,
    audit,
    hook,
    offer: settings.offer_description,
    examples,
    rules,
    signal: signal && { job_title: signal.job_title, posted_at: signal.posted_at, excerpt: signal.excerpt },
    software,
    revision: feedback && {
      subject: feedback.subject ?? parseSteps(email.steps)[0]?.subject ?? '',
      opener: feedback.opener ?? email.opener ?? '',
      feedback: feedback.note,
    },
  })

  // Saved once the redraft worked, so a retry doesn't store it twice
  if (feedback) {
    await saveCopyFeedback(crm, {
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
  const updated = await updateOutreachEmail(crm, email.id, {
    audit: (audit ?? {}) as unknown as Json,
    primary_hook: hook,
    opener: draft.opener || null,
    linkedin_draft: draft.linkedin || null,
    steps: steps as unknown as Json,
    // A rejected draft isn't Claude's; whatever Dami writes is "human"
    draft_steps: draft.problems.length ? null : (steps as unknown as Json),
    template_key: template.key,
    model: draft.model,
    author: draft.problems.length ? null : 'claude',
    drafted_at: new Date().toISOString(),
  })
  if (email.run_id) await markRunAwaitingReview(crm, email.run_id)

  return { email: updated, lead, problems: draft.problems }
}
