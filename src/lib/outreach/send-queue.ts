import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Lead, OutreachEmail, OutreachEmailUpdate } from '@/types/database'
import {
  countMessagesSince,
  countSendsAndBounces,
  fetchDueFollowUps,
  fetchLastSentAt,
  fetchMessage,
  fetchQueued,
  fetchSeedMessages,
  fetchSuppressions,
  findStageByName,
  insertOutreachMessage,
  logActivity,
  moveLeadToStage,
  pauseSending,
  setSetting,
  updateOutreachEmail,
  type EmailWithLead,
} from './adapters/obatek-crm'
import { blockedReason, checkLead, emailDomain } from './compliance'
import { GraphError, isSenderBlocked, sendNewMessage, sendReply, type SentMessage } from './graph-client'
import { footer, MessageError, messageSubject, messageText } from './mail-message'
import { effectiveDailyCap, inSendWindow, nextStepAt, pickSends, seedDue, startOfLocalDay, type DailyCap } from './sequence'
import type { OutreachSettings } from './settings'
import { parseSteps } from './templates'

// Sends what's due from the connected mailbox, a few messages per scheduler
// tick (OUTREACH_PLAN.md §11): follow-ups first, then queued first emails,
// inside the send window and under the warm-up cap.

type Crm = SupabaseClient<Database>

export interface Mailbox {
  address: string
  accessToken: string
}

export interface SendDueResult {
  sent: number
  followUps: number
  seeds: number
  blocked: number
  failed: number
  stopped: number
  // Why nothing was sent this tick, if nothing was
  skipped: string | null
  cap: DailyCap | null
  paused: string | null
  errors: string[]
}

const BOUNCE_WINDOW_DAYS = 7

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

function recipient(lead: Lead): string | null {
  return lead.email?.trim().toLowerCase() || null
}

async function recordSent(
  crm: Crm,
  email: OutreachEmail,
  step: number,
  to: string,
  subject: string,
  message: SentMessage,
  at: string
) {
  await insertOutreachMessage(crm, {
    email_id: email.id,
    kind: 'outreach',
    step,
    to_address: to,
    subject,
    graph_message_id: message.id,
    internet_message_id: message.internetMessageId,
    conversation_id: message.conversationId,
    sent_at: at,
  })
}

// Where the sequence goes after `step` was sent
function afterStep(step: number, totalSteps: number, sentAt: Date, settings: OutreachSettings): OutreachEmailUpdate {
  if (step >= totalSteps) return { sequence_state: 'finished', next_step: null, next_step_at: null }
  const next = (step + 1) as 2 | 3
  return {
    sequence_state: 'active',
    next_step: next,
    next_step_at: nextStepAt(sentAt, next, settings).toISOString(),
  }
}

async function stopSequence(crm: Crm, email: OutreachEmail, reason: string) {
  await updateOutreachEmail(crm, email.id, {
    sequence_state: 'stopped',
    next_step: null,
    next_step_at: null,
    stopped_reason: reason,
  })
}

export async function sendDue(
  crm: Crm,
  options: { mailbox: Mailbox; settings: OutreachSettings; mailingAddress: string | undefined; now?: Date }
): Promise<SendDueResult> {
  const { mailbox, mailingAddress } = options
  const settings = { ...options.settings }
  const now = options.now ?? new Date()
  const nowIso = now.toISOString()
  const result: SendDueResult = {
    sent: 0,
    followUps: 0,
    seeds: 0,
    blocked: 0,
    failed: 0,
    stopped: 0,
    skipped: null,
    cap: null,
    paused: null,
    errors: [],
  }

  if (settings.sending_paused) {
    result.skipped = 'Sending is paused'
    return result
  }
  if (!inSendWindow(now, settings)) {
    result.skipped = 'Outside the send window'
    return result
  }

  let footerText: string
  try {
    footerText = footer(settings.sender_name, mailingAddress)
  } catch (error) {
    result.skipped = errorMessage(error)
    return result
  }

  const [sentToday, week, seeds] = await Promise.all([
    countMessagesSince(crm, startOfLocalDay(now, settings.send_timezone)),
    countSendsAndBounces(crm, new Date(now.getTime() - BOUNCE_WINDOW_DAYS * 86_400_000)),
    fetchSeedMessages(crm, 20),
  ])
  const lastChecked = seeds.find((s) => s.placement)
  result.cap = effectiveDailyCap(settings, {
    sent7d: week.sent,
    bounced7d: week.bounced,
    lastSeedSpam: lastChecked?.placement === 'spam' || lastChecked?.placement === 'missing',
    now,
  })
  const room = result.cap.cap - sentToday
  if (room <= 0) {
    result.skipped = `Today's limit of ${result.cap.cap} is reached`
    return result
  }

  const limit = Math.min(room, Math.max(1, settings.sends_per_tick))
  const [due, queued, suppressions, target] = await Promise.all([
    fetchDueFollowUps(crm, now, limit),
    fetchQueued(crm, limit),
    fetchSuppressions(crm),
    findStageByName(crm, settings.target_stage_name),
  ])
  if (!target) {
    result.skipped = `No pipeline stage named "${settings.target_stage_name}"`
    return result
  }
  const picks = pickSends(due, queued, limit)
  if (picks.followUps.length + picks.firsts.length === 0) {
    result.skipped = 'Nothing due'
    return result
  }

  const isSuppressed = (address: string) => {
    const domain = emailDomain(address)
    return suppressions.emails.has(address) || (!!domain && suppressions.domains.has(domain))
  }

  // ---------- one follow-up, threaded as a reply to email 1 ----------
  const sendFollowUp = async ({ email, lead }: EmailWithLead) => {
    const step = email.next_step
    const steps = parseSteps(email.steps)
    const to = recipient(lead)
    const stopReason =
      !step || !steps[step - 1]
        ? 'No follow-up text'
        : email.replied_at
          ? 'They replied'
          : email.bounced_at
            ? 'Bounced'
            : email.unsubscribed_at
              ? 'Unsubscribed'
              : !to || isSuppressed(to)
                ? 'On the do-not-contact list'
                : lead.stage_id !== target.id
                  ? `Lead moved out of ${settings.target_stage_name}`
                  : null
    if (stopReason) {
      await stopSequence(crm, email, stopReason)
      result.stopped++
      return
    }

    // Sent on an earlier tick that failed before saving: just move on
    if (await fetchMessage(crm, email.id, step!)) {
      await updateOutreachEmail(crm, email.id, afterStep(step!, steps.length, now, settings))
      return
    }
    const original = await fetchMessage(crm, email.id, 1)
    if (!original?.graph_message_id) {
      await stopSequence(crm, email, 'Email 1 was not sent from this mailbox')
      result.stopped++
      return
    }

    const current = steps[step! - 1]
    try {
      const text = messageText(current, footerText)
      const sent = await sendReply(mailbox.accessToken, original.graph_message_id, { to: to!, text })
      await recordSent(crm, email, step!, to!, current.subject, sent, nowIso)
    } catch (error) {
      if (error instanceof GraphError && error.accountWide) throw error
      // The thread is gone (email 1 deleted from Sent Items) or the text is empty
      await stopSequence(crm, email, `Follow-up failed: ${errorMessage(error)}`)
      result.failed++
      return
    }
    await updateOutreachEmail(crm, email.id, { ...afterStep(step!, steps.length, now, settings), last_error: null })
    await logActivity(crm, {
      lead_id: lead.id,
      type: 'email',
      title: `Outreach email ${step} sent`,
      description: current.subject,
      meta: { channel: 'email', external_id: `outreach:${email.id}:step${step}`, run_id: email.run_id },
    })
    result.followUps++
  }

  // ---------- one first email ----------
  let firstSent: { subject: string; text: string } | null = null

  const sendFirst = async ({ email, lead }: EmailWithLead) => {
    const steps = parseSteps(email.steps)
    const to = recipient(lead)

    if (!(await fetchMessage(crm, email.id, 1))) {
      // Compliance again with fresh data: the lead may have changed since approval
      const warnings = checkLead(lead, {
        suppressedEmails: suppressions.emails,
        suppressedDomains: suppressions.domains,
        lastSentAt: await fetchLastSentAt(crm, [lead.id]),
        cooldownDays: settings.resequence_cooldown_days,
        now,
      })
      const reason = blockedReason(warnings)
      if (reason || !to) {
        await updateOutreachEmail(crm, email.id, { status: 'blocked', blocked_reason: reason ?? 'No email address' })
        result.blocked++
        return
      }

      let subject: string
      let text: string
      try {
        subject = messageSubject(steps[0] ?? { step: 1, subject: '', body: '' })
        text = messageText(steps[0], footerText)
      } catch (error) {
        if (!(error instanceof MessageError)) throw error
        await updateOutreachEmail(crm, email.id, { status: 'failed', last_error: error.message })
        result.failed++
        return
      }

      try {
        const sent = await sendNewMessage(mailbox.accessToken, { to, subject, text })
        await recordSent(crm, email, 1, to, subject, sent, nowIso)
        firstSent ??= { subject, text }
      } catch (error) {
        if (error instanceof GraphError && error.accountWide) throw error
        await updateOutreachEmail(crm, email.id, { status: 'failed', last_error: errorMessage(error) })
        result.failed++
        return
      }
    }

    await updateOutreachEmail(crm, email.id, {
      status: 'sent',
      sent_at: nowIso,
      last_error: null,
      ...afterStep(1, steps.length, now, settings),
    })
    await logActivity(crm, {
      lead_id: lead.id,
      type: 'email',
      title: 'Outreach email 1 sent',
      description: steps[0]?.subject,
      meta: { channel: 'email', external_id: `outreach:${email.id}:step1`, run_id: email.run_id },
    })
    if (lead.stage_id !== target.id) await moveLeadToStage(crm, lead.id, target.id)

    // The warm-up ramp counts from the first real send
    if (!settings.warmup_started_at) {
      await setSetting(crm, 'warmup_started_at', nowIso)
      settings.warmup_started_at = nowIso
    }
    result.sent++
  }

  try {
    for (const item of picks.followUps) {
      try {
        await sendFollowUp(item)
      } catch (error) {
        if (error instanceof GraphError && error.accountWide) throw error
        result.errors.push(`Follow-up ${item.email.id}: ${errorMessage(error)}`)
      }
    }
    for (const item of picks.firsts) {
      try {
        await sendFirst(item)
      } catch (error) {
        if (error instanceof GraphError && error.accountWide) throw error
        result.errors.push(`Email ${item.email.id}: ${errorMessage(error)}`)
      }
    }

    // Placement check: a copy of today's first email to your own inboxes
    const sample = firstSent as { subject: string; text: string } | null
    if (sample && seedDue(now, seeds[0] ? new Date(seeds[0].sent_at) : null, settings)) {
      for (const address of settings.seed_addresses) {
        const sent = await sendNewMessage(mailbox.accessToken, { to: address, subject: sample.subject, text: sample.text })
        await insertOutreachMessage(crm, {
          kind: 'seed',
          to_address: address,
          subject: sample.subject,
          graph_message_id: sent.id,
          internet_message_id: sent.internetMessageId,
          conversation_id: sent.conversationId,
          sent_at: nowIso,
        })
        result.seeds++
      }
    }
  } catch (error) {
    // The mailbox or the account can't send: stop, keep the queue for later
    result.errors.push(errorMessage(error))
    if (isSenderBlocked(error)) {
      await pauseSending(crm, errorMessage(error))
      result.paused = errorMessage(error)
    }
  }
  return result
}

// "Send test to me": email 1 exactly as it would go out, to the mailbox
// itself. Nothing about the lead changes.
export async function sendTest(
  crm: Crm,
  options: { mailbox: Mailbox; email: OutreachEmail; settings: OutreachSettings; mailingAddress: string | undefined }
): Promise<void> {
  const { mailbox, email, settings } = options
  const step = parseSteps(email.steps)[0]
  if (!step) throw new MessageError('This email has no text yet')
  const subject = `[Test] ${messageSubject(step)}`
  const sent = await sendNewMessage(mailbox.accessToken, {
    to: mailbox.address,
    subject,
    text: messageText(step, footer(settings.sender_name, options.mailingAddress)),
  })
  await insertOutreachMessage(crm, {
    kind: 'test',
    to_address: mailbox.address,
    subject,
    graph_message_id: sent.id,
    internet_message_id: sent.internetMessageId,
    conversation_id: sent.conversationId,
  })
}
