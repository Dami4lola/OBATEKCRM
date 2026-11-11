import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, ReplyClass, SuppressionReason } from '@/types/database'
import {
  addSuppression,
  countSendsAndBounces,
  fetchSentForMatching,
  logActivity,
  pauseSending,
  setInboxCheckedAt,
  updateOutreachEmail,
} from './adapters/obatek-crm'
import { listMessagesSince, type ReceivedMessage } from './graph-client'
import { errorMessage } from './errors'
import {
  classifyIncoming,
  indexSentEmails,
  inboxChange,
  matchMessage,
  replyText,
  type InboxChange,
  type InboxIndex,
  type Incoming,
  type MatchedBy,
  type SentEmail,
} from './inbox-events'
import { classifyReply } from './reply-classifier'
import type { OutreachSettings } from './settings'
import { EVENT_TITLES, REPLY_CLASS_LABELS, shouldAutoPause, type StatsEvent } from './stats'

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

// What one sync shares
interface InboxSync {
  crm: Crm
  settings: OutreachSettings
  canClassify: boolean
  index: InboxIndex
  result: SyncResult
  paused: boolean
  classifyBudget: number
}

// Microsoft or a receiving server is blocking us: stop everything now
async function pauseIfBlocked(sync: InboxSync, incoming: Incoming) {
  if (incoming.kind !== 'bounce' || !incoming.bounce.senderBlocked || sync.paused) return
  const reason = `Paused automatically: a bounce notice says this mailbox is blocked (${incoming.bounce.code}). Check the Microsoft 365 admin centre (Restricted entities) before turning sending back on.`
  await pauseSending(sync.crm, reason)
  sync.paused = true
  sync.result.paused = reason
}

// Asks Claude what kind of reply this is, within the budget for one sync
async function labelReply(sync: InboxSync, email: SentEmail, message: ReceivedMessage, change: InboxChange) {
  if (!change.needsClassifying || !sync.canClassify || sync.classifyBudget <= 0) return
  sync.classifyBudget--
  try {
    const label = await classifyReply(sync.settings.reply_model, replyText(message.text))
    if (!label) return
    change.updates.reply_class = label
    // Claude heard an opt-out the keyword check missed
    if (label === 'unsubscribe' && !email.unsubscribed_at) {
      change.updates.unsubscribed_at = message.receivedAt
      change.events.push('unsubscribed')
      change.suppress = 'unsubscribe'
    }
  } catch (error) {
    sync.result.errors.push(`Labelling a reply: ${errorMessage(error)}`)
  }
}

async function logEvents(
  sync: InboxSync,
  { email, by }: { email: SentEmail; by: MatchedBy },
  message: ReceivedMessage,
  events: StatsEvent[],
  replyClass: ReplyClass | null
) {
  for (const event of events) {
    const label = event === 'replied' && replyClass ? ` (${REPLY_CLASS_LABELS[replyClass].toLowerCase()})` : ''
    const colleague = by === 'domain' && event === 'replied' ? ` by ${message.from}` : ''
    await logActivity(sync.crm, {
      lead_id: email.lead_id,
      type: 'email',
      title: `${EVENT_TITLES[event]}${label}${colleague}`,
      meta: { channel: 'email', external_id: `outreach:${email.id}:${event}`, run_id: email.run_id },
    })
  }
}

// The lead's address, and a colleague's if they're the one asking
async function suppressAddresses(sync: InboxSync, email: SentEmail, message: ReceivedMessage, reason: SuppressionReason) {
  const addresses = new Set([email.leadEmail, reason === 'unsubscribe' ? message.from : null])
  for (const address of addresses) {
    if (!address) continue
    await addSuppression(sync.crm, address, reason)
    sync.result.suppressed++
  }
}

// What one message changes on the email it belongs to
async function applyMessage(sync: InboxSync, message: ReceivedMessage) {
  const { crm, settings, result } = sync
  const incoming = classifyIncoming(message)
  await pauseIfBlocked(sync, incoming)

  const match = matchMessage(message, incoming, sync.index)
  if (!match) return
  const email = match.email
  const change = inboxChange(email, incoming, message, settings.send_timezone)
  await labelReply(sync, email, message, change)

  if (Object.keys(change.updates).length > 0) {
    await updateOutreachEmail(crm, email.id, change.updates)
    // Later messages in this batch see the new state
    Object.assign(email, change.updates)
    result.updated++
  }

  const replyClass = change.updates.reply_class ?? email.reply_class
  await logEvents(sync, match, message, change.events, replyClass)
  if (change.suppress) await suppressAddresses(sync, email, message, change.suppress)

  if (change.events.includes('replied')) {
    result.newReplies.push({ emailId: email.id, leadId: email.lead_id, company: email.company, replyClass: replyClass ?? null })
  }
}

async function pauseOnBounces({ crm, result }: InboxSync, now: Date) {
  const { sent, bounced } = await countSendsAndBounces(crm, new Date(now.getTime() - BOUNCE_WINDOW_DAYS * 86_400_000))
  if (!shouldAutoPause(sent, bounced)) return
  const reason = `Paused automatically: ${bounced} of ${sent} emails bounced in the last ${BOUNCE_WINDOW_DAYS} days (over 5%). Clean the list, then turn sending back on.`
  await pauseSending(crm, reason)
  result.paused = reason
}

export async function syncInbox(
  crm: Crm,
  { mailbox, settings, canClassify, now = new Date() }: SyncOptions
): Promise<SyncResult> {
  const result: SyncResult = { checked: 0, updated: 0, newReplies: [], suppressed: 0, paused: null, errors: [] }

  const since = mailbox.inboxCheckedAt
    ? new Date(new Date(mailbox.inboxCheckedAt).getTime() - OVERLAP_MS)
    : new Date(now.getTime() - FIRST_SYNC_LOOKBACK_MS)
  const [{ messages, more }, sent] = await Promise.all([
    listMessagesSince(mailbox.accessToken, since),
    fetchSentForMatching(crm, new Date(now.getTime() - SENT_WINDOW_DAYS * 86_400_000)),
  ])
  const sync: InboxSync = {
    crm,
    settings,
    canClassify,
    index: indexSentEmails(sent),
    result,
    paused: settings.sending_paused,
    classifyBudget: MAX_CLASSIFY,
  }
  const ownAddress = mailbox.address.toLowerCase()

  for (const message of messages) {
    // Our own sent mail, tests to ourselves
    if (!message.from || message.from === ownAddress) continue
    result.checked++
    try {
      await applyMessage(sync, message)
    } catch (error) {
      result.errors.push(`Message from ${message.from}: ${errorMessage(error)}`)
    }
  }

  // Stopped at the page limit: carry on from the last message read
  const last = messages.at(-1)
  await setInboxCheckedAt(crm, more && last ? new Date(last.receivedAt) : now)

  if (!sync.paused) await pauseOnBounces(sync, now)
  return result
}
