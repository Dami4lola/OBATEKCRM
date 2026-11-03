import type { OutreachEmail, OutreachEmailUpdate, ReplyClass, SuppressionReason } from '@/types/database'
import { emailDomain } from './compliance'
import type { ReceivedMessage } from './graph-client'
import { UNSUBSCRIBE_LINE } from './mail-message'
import { addBusinessDays } from './sequence'
import { FREE_MAIL_DOMAINS } from './sourcing'
import type { StatsEvent } from './stats'

// What a message in the mailbox means for a sent email (OUTREACH_PLAN.md
// §11): a reply, an out-of-office, or a bounce notice. Pure, so it's
// testable without the mailbox. Received mail is untrusted text: it's only
// matched against fixed patterns here (§16 S3).

// ---------- what kind of message ----------

export interface Bounce {
  // Every address in the notice; the matcher picks the one we sent to
  addresses: string[]
  code: string | null
  permanent: boolean
  // Microsoft or the recipient blocked *us*, not just this address
  senderBlocked: boolean
}

export type Incoming = { kind: 'bounce'; bounce: Bounce } | { kind: 'auto_reply' } | { kind: 'reply' }

const NDR_SENDER = /^(postmaster|mailer-daemon|microsoftexchange[0-9a-f]*)@/i
const NDR_SUBJECT =
  /^(undeliverable|undelivered mail|delivery status notification|delivery has failed|mail delivery (failed|subsystem)|returned mail|failure notice|message not delivered)/i
// Exchange Online: tenant or mailbox blocked from sending
const SENDER_BLOCKED_CODES = new Set(['5.7.233', '5.7.708', '5.1.8', '5.7.705', '5.7.750', '5.7.501', '5.7.511'])

const AUTO_REPLY_SUBJECT = /^(automatic reply|auto(matic)?[ -]?reply|autoreply|out of (the )?office|away from (the )?office)\b/i

const ADDRESS = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi

function isAutoReply(message: ReceivedMessage): boolean {
  const h = message.headers
  const autoSubmitted = h['auto-submitted']?.trim().toLowerCase()
  if (autoSubmitted && autoSubmitted !== 'no') return true
  if (h['x-autoreply'] || h['x-autorespond']) return true
  if (/^(auto_reply|auto-reply)$/i.test(h['precedence']?.trim() ?? '')) return true
  return AUTO_REPLY_SUBJECT.test(message.subject.trim())
}

export function classifyIncoming(message: ReceivedMessage): Incoming {
  const from = message.from ?? ''
  if (NDR_SENDER.test(from) || NDR_SUBJECT.test(message.subject.trim())) {
    const code = /\b([245])\.(\d{1,3})\.(\d{1,3})\b/.exec(message.text)?.[0] ?? null
    const addresses = [...new Set((message.text.match(ADDRESS) ?? []).map((a) => a.toLowerCase()))].filter(
      (a) => !NDR_SENDER.test(a)
    )
    return {
      kind: 'bounce',
      bounce: {
        addresses,
        code,
        // No code at all: treat a notice from the mail system as permanent
        permanent: code === null || code.startsWith('5'),
        senderBlocked: code !== null && SENDER_BLOCKED_CODES.has(code),
      },
    }
  }
  return isAutoReply(message) ? { kind: 'auto_reply' } : { kind: 'reply' }
}

// ---------- the reply itself ----------

// Where the quoted earlier email starts in common clients
const QUOTE_START = [
  /^On .{4,200} wrote:\s*$/m, // Gmail, Apple Mail
  /^-{2,}\s*Original Message\s*-{2,}/im,
  /^From: .+$/m, // Outlook
  /^>/m,
  /^_{10,}\s*$/m, // Outlook separator line
]

// Our footer's opt-out line, even when a quote wraps it
const FOOTER_LINE = /reply stop or|won't email you again|^\s*>?\s*--\s*$/i

function withoutFooter(text: string): string {
  return text
    .split(/\r?\n/)
    .filter((line) => !line.includes(UNSUBSCRIBE_LINE) && !FOOTER_LINE.test(line))
    .join('\n')
    .trim()
}

// Only what they wrote: the quoted email (with our footer and its
// "unsubscribe" wording) is cut off
export function replyText(text: string): string {
  let end = text.length
  for (const pattern of QUOTE_START) {
    const match = pattern.exec(text)
    if (match && match.index < end) end = match.index
  }
  // Nothing above the quote (a reply typed underneath it): keep it all
  return withoutFooter(text.slice(0, end)) || withoutFooter(text)
}

const UNSUBSCRIBE_WORDING =
  /\b(unsubscribe|remove me|take me off|opt[ -]?out|stop (emailing|contacting|sending|messaging)|(do not|don't|dont) (email|contact|message) (me|us)|no more emails)\b/i

// "STOP", "Stop please", "please stop." as the whole first line; not "Stop
// by next week"
const STOP_LINE = /^(please\s+)?stop(\s+please)?[\s.!]*$/i

// The opt-out the footer promises: STOP on its own, or plain unsubscribe
// wording. Checked before any Claude call, so it always works.
export function isUnsubscribeText(text: string): boolean {
  const own = replyText(text)
  const firstLine = own.split(/\r?\n/).find((line) => line.trim()) ?? ''
  return STOP_LINE.test(firstLine.trim()) || UNSUBSCRIBE_WORDING.test(own)
}

// ---------- which sent email it belongs to ----------

export interface SentEmail
  extends Pick<
    OutreachEmail,
    | 'id'
    | 'lead_id'
    | 'run_id'
    | 'sent_at'
    | 'replied_at'
    | 'reply_class'
    | 'bounced_at'
    | 'unsubscribed_at'
    | 'sequence_state'
    | 'next_step'
    | 'next_step_at'
  > {
  leadEmail: string | null
  company: string
  conversationIds: string[]
}

export type MatchedBy = 'thread' | 'address' | 'domain'

export interface InboxIndex {
  byConversation: Map<string, SentEmail>
  byAddress: Map<string, SentEmail>
  byDomain: Map<string, SentEmail>
}

// Newest send wins when a lead was emailed more than once
export function indexSentEmails(emails: SentEmail[]): InboxIndex {
  const index: InboxIndex = { byConversation: new Map(), byAddress: new Map(), byDomain: new Map() }
  const sorted = [...emails].sort((a, b) => (a.sent_at ?? '').localeCompare(b.sent_at ?? ''))
  for (const email of sorted) {
    for (const id of email.conversationIds) index.byConversation.set(id, email)
    const address = email.leadEmail?.trim().toLowerCase()
    if (!address) continue
    index.byAddress.set(address, email)
    const domain = emailDomain(address)
    if (domain && !FREE_MAIL_DOMAINS.has(domain)) index.byDomain.set(domain, email)
  }
  return index
}

// Same thread first, then the lead's own address, then a colleague at the
// same company domain (never a free-mail domain)
export function matchMessage(
  message: ReceivedMessage,
  incoming: Incoming,
  index: InboxIndex
): { email: SentEmail; by: MatchedBy } | null {
  if (message.conversationId) {
    const email = index.byConversation.get(message.conversationId)
    if (email) return { email, by: 'thread' }
  }
  if (incoming.kind === 'bounce') {
    for (const address of incoming.bounce.addresses) {
      const email = index.byAddress.get(address)
      if (email) return { email, by: 'address' }
    }
    return null
  }
  const from = message.from?.toLowerCase()
  if (!from) return null
  const byAddress = index.byAddress.get(from)
  if (byAddress) return { email: byAddress, by: 'address' }
  const domain = emailDomain(from)
  const byDomain = domain ? index.byDomain.get(domain) : undefined
  return byDomain ? { email: byDomain, by: 'domain' } : null
}

// ---------- what changes ----------

export interface InboxChange {
  updates: OutreachEmailUpdate
  // First time each was seen; logged once on the lead's timeline
  events: StatsEvent[]
  suppress: SuppressionReason | null
  // A human reply with no label yet: ask the classifier
  needsClassifying: boolean
}

const OUT_OF_OFFICE_DELAY_DAYS = 3

function stop(email: SentEmail, reason: string): OutreachEmailUpdate {
  return email.sequence_state === 'active'
    ? { sequence_state: 'stopped', next_step: null, next_step_at: null, stopped_reason: reason }
    : {}
}

export function inboxChange(
  email: SentEmail,
  incoming: Incoming,
  message: ReceivedMessage,
  timeZone: string
): InboxChange {
  const change: InboxChange = { updates: {}, events: [], suppress: null, needsClassifying: false }
  const at = message.receivedAt

  if (incoming.kind === 'bounce') {
    // A temporary failure (4.x.x) is retried by Microsoft; nothing to do
    if (!incoming.bounce.permanent || email.bounced_at) return change
    change.updates = { bounced_at: at, ...stop(email, 'Bounced') }
    change.events.push('bounced')
    change.suppress = 'hard_bounce'
    return change
  }

  if (incoming.kind === 'auto_reply') {
    // Away: the next follow-up waits until they're likely back
    if (email.sequence_state === 'active' && email.next_step_at) {
      const later = addBusinessDays(new Date(at), OUT_OF_OFFICE_DELAY_DAYS, timeZone)
      if (later > new Date(email.next_step_at)) change.updates.next_step_at = later.toISOString()
    }
    return change
  }

  // A person replied: the sequence always stops
  if (!email.replied_at) {
    change.updates = { replied_at: at, ...stop(email, 'They replied') }
    change.events.push('replied')
  }
  if (isUnsubscribeText(message.text)) {
    if (!email.unsubscribed_at) {
      change.updates = { ...change.updates, unsubscribed_at: at, reply_class: 'unsubscribe' as ReplyClass, ...stop(email, 'Unsubscribed') }
      change.events.push('unsubscribed')
    }
    change.suppress = 'unsubscribe'
  } else {
    change.needsClassifying = !email.reply_class
  }
  return change
}
