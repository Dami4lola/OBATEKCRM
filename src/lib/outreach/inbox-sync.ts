import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, ReplyClass } from '@/types/database'
import {
  addSuppression,
  countSendsAndBounces,
  fetchSentForMatching,
  logActivity,
  pauseSending,
  setInboxCheckedAt,
  updateOutreachEmail,
} from './adapters/obatek-crm'
import { listMessagesSince } from './graph-client'
import { classifyIncoming, indexSentEmails, inboxChange, matchMessage, replyText } from './inbox-events'
import { classifyReply } from './reply-classifier'
import type { OutreachSettings } from './settings'
import { EVENT_TITLES, REPLY_CLASS_LABELS, shouldAutoPause } from './stats'

// Reads new mail in the sending mailbox (every folder, Junk included) and
// applies it to the emails we sent: replies stop the sequence and get a
// label, "unsubscribe" replies and hard bounces go on the do-not-contact
// list, out-of-office replies push the next follow-up back (§11). Run by
// the scheduler's tick and when the pop-up opens.

type Crm = SupabaseClient<Database>

// Re-read a little before the watermark: mail can land slightly out of order
const OVERLAP_MS = 5 * 60_000
const FIRST_SYNC_LOOKBACK_MS = 86_400_000
const SENT_WINDOW_DAYS = 60 // replies to older emails aren't matched
const MAX_CLASSIFY = 10
const BOUNCE_WINDOW_DAYS = 7

export interface NewReply {
  emailId: string
  leadId: string
  company: string
  replyClass: ReplyClass | null
}

export interface SyncResult {
  checked: number
  updated: number
  newReplies: NewReply[]
  suppressed: number
  paused: string | null
  errors: string[]
}

export interface SyncOptions {
  mailbox: { address: string; accessToken: string; inboxCheckedAt: string | null }
  settings: OutreachSettings
  // Reply labels need ANTHROPIC_API_KEY; without it replies stay unlabelled
  canClassify: boolean
  now?: Date
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

export async function syncInbox(
  crm: Crm,
  { mailbox, settings, canClassify, now = new Date() }: SyncOptions
): Promise<SyncResult> {
  const result: SyncResult = { checked: 0, updated: 0, newReplies: [], suppressed: 0, paused: null, errors: [] }
  let paused = settings.sending_paused

  const since = mailbox.inboxCheckedAt
    ? new Date(new Date(mailbox.inboxCheckedAt).getTime() - OVERLAP_MS)
    : new Date(now.getTime() - FIRST_SYNC_LOOKBACK_MS)
  const [{ messages, more }, sent] = await Promise.all([
    listMessagesSince(mailbox.accessToken, since),
    fetchSentForMatching(crm, new Date(now.getTime() - SENT_WINDOW_DAYS * 86_400_000)),
  ])
  const index = indexSentEmails(sent)
  const ownAddress = mailbox.address.toLowerCase()
  let classifyBudget = MAX_CLASSIFY

  for (const message of messages) {
    // Our own sent mail, tests to ourselves
    if (!message.from || message.from === ownAddress) continue
    result.checked++
    try {
      const incoming = classifyIncoming(message)

      // Microsoft or a receiving server is blocking us: stop everything now
      if (incoming.kind === 'bounce' && incoming.bounce.senderBlocked && !paused) {
        const reason = `Paused automatically: a bounce notice says this mailbox is blocked (${incoming.bounce.code}). Check the Microsoft 365 admin centre (Restricted entities) before turning sending back on.`
        await pauseSending(crm, reason)
        paused = true
        result.paused = reason
      }

      const match = matchMessage(message, incoming, index)
      if (!match) continue
      const email = match.email
      const change = inboxChange(email, incoming, message, settings.send_timezone)

      if (change.needsClassifying && canClassify && classifyBudget > 0) {
        classifyBudget--
        try {
          const label = await classifyReply(settings.reply_model, replyText(message.text))
          if (label) {
            change.updates.reply_class = label
            // Claude heard an opt-out the keyword check missed
            if (label === 'unsubscribe' && !email.unsubscribed_at) {
              change.updates.unsubscribed_at = message.receivedAt
              change.events.push('unsubscribed')
              change.suppress = 'unsubscribe'
            }
          }
        } catch (error) {
          result.errors.push(`Labelling a reply: ${errorMessage(error)}`)
        }
      }

      if (Object.keys(change.updates).length > 0) {
        await updateOutreachEmail(crm, email.id, change.updates)
        // Later messages in this batch see the new state
        Object.assign(email, change.updates)
        result.updated++
      }

      const replyClass = change.updates.reply_class ?? email.reply_class
      for (const event of change.events) {
        const label = event === 'replied' && replyClass ? ` (${REPLY_CLASS_LABELS[replyClass].toLowerCase()})` : ''
        const colleague = match.by === 'domain' && event === 'replied' ? ` by ${message.from}` : ''
        await logActivity(crm, {
          lead_id: email.lead_id,
          type: 'email',
          title: `${EVENT_TITLES[event]}${label}${colleague}`,
          meta: { channel: 'email', external_id: `outreach:${email.id}:${event}`, run_id: email.run_id },
        })
      }

      if (change.suppress) {
        // The lead's address, and a colleague's if they're the one asking
        const addresses = new Set([email.leadEmail, change.suppress === 'unsubscribe' ? message.from : null])
        for (const address of addresses) {
          if (!address) continue
          await addSuppression(crm, address, change.suppress)
          result.suppressed++
        }
      }

      if (change.events.includes('replied')) {
        result.newReplies.push({ emailId: email.id, leadId: email.lead_id, company: email.company, replyClass: replyClass ?? null })
      }
    } catch (error) {
      result.errors.push(`Message from ${message.from}: ${errorMessage(error)}`)
    }
  }

  // Stopped at the page limit: carry on from the last message read
  const last = messages.at(-1)
  await setInboxCheckedAt(crm, more && last ? new Date(last.receivedAt) : now)

  if (!paused) {
    const { sent: sent7d, bounced } = await countSendsAndBounces(
      crm,
      new Date(now.getTime() - BOUNCE_WINDOW_DAYS * 86_400_000)
    )
    if (shouldAutoPause(sent7d, bounced)) {
      const reason = `Paused automatically: ${bounced} of ${sent7d} emails bounced in the last ${BOUNCE_WINDOW_DAYS} days (over 5%). Clean the list, then turn sending back on.`
      await pauseSending(crm, reason)
      result.paused = reason
    }
  }

  return result
}
