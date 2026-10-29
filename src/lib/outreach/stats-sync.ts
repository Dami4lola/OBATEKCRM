import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, ReplyClass } from '@/types/database'
import {
  addSuppression,
  countSendsAndBounces,
  fetchEmailsToSync,
  logActivity,
  pauseSending,
  updateOutreachEmail,
} from './adapters/obatek-crm'
import { latestReply, listInstantlyLeads } from './instantly-client'
import { classifyReply } from './reply-classifier'
import type { OutreachSettings } from './settings'
import { EVENT_TITLES, REPLY_CLASS_LABELS, shouldAutoPause, statsUpdate } from './stats'

// Pulls opens, replies, bounces and unsubscribes back from Instantly for
// sent emails (§11). Run by the scheduler's tick and when the pop-up opens.

type Crm = SupabaseClient<Database>

const STALE_MINUTES = 15
const SYNC_DAYS = 60 // emails older than this aren't polled any more
const MAX_EMAILS = 300
// Instantly allows 20 email reads a minute; replies are rare anyway
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
  apiKey: string
  settings: OutreachSettings
  // Reply classification needs ANTHROPIC_API_KEY; without it replies stay unlabelled
  canClassify: boolean
  now?: Date
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

export async function syncStats(crm: Crm, { apiKey, settings, canClassify, now = new Date() }: SyncOptions): Promise<SyncResult> {
  const result: SyncResult = { checked: 0, updated: 0, newReplies: [], suppressed: 0, paused: null, errors: [] }

  const emails = await fetchEmailsToSync(
    crm,
    new Date(now.getTime() - STALE_MINUTES * 60_000),
    new Date(now.getTime() - SYNC_DAYS * 86_400_000),
    MAX_EMAILS
  )
  if (emails.length > 0) {
    const stats = await listInstantlyLeads(apiKey, emails.map((e) => e.instantly_lead_id!))
    const byId = new Map(stats.map((lead) => [lead.id, lead]))
    let classifyBudget = MAX_CLASSIFY

    for (const email of emails) {
      result.checked++
      try {
        const lead = byId.get(email.instantly_lead_id!)
        if (!lead) {
          // Deleted in Instantly: stop asking every tick
          await updateOutreachEmail(crm, email.id, { stats_synced_at: now.toISOString() })
          continue
        }

        const change = statsUpdate(email, lead, now)
        const address = email.lead?.email?.trim() || null
        if (change.needsClassifying && canClassify && address && classifyBudget > 0) {
          classifyBudget--
          try {
            const reply = await latestReply(apiKey, address)
            if (reply) {
              const replyClass = reply.isAutoReply ? 'out_of_office' : await classifyReply(settings.reply_model, reply.text)
              if (replyClass) change.updates.reply_class = replyClass
            }
          } catch (error) {
            result.errors.push(`Classifying a reply: ${errorMessage(error)}`)
          }
        }

        const replyClass = change.updates.reply_class ?? email.reply_class
        const suppress =
          change.suppress ?? (change.updates.reply_class === 'unsubscribe' ? 'unsubscribe' : null)

        await updateOutreachEmail(crm, email.id, change.updates)
        if (change.events.length > 0 || Object.keys(change.updates).length > 1) result.updated++

        for (const event of change.events) {
          const label = event === 'replied' && replyClass ? ` (${REPLY_CLASS_LABELS[replyClass].toLowerCase()})` : ''
          await logActivity(crm, {
            lead_id: email.lead_id,
            type: 'email',
            title: `${EVENT_TITLES[event]}${label}`,
            meta: { channel: 'email', external_id: `outreach:${email.id}:${event}`, run_id: email.run_id },
          })
        }

        if (suppress && address) {
          await addSuppression(crm, address, suppress)
          result.suppressed++
        }

        if (change.events.includes('replied')) {
          result.newReplies.push({
            emailId: email.id,
            leadId: email.lead_id,
            company: email.lead?.company_name || email.lead?.contact_name || 'A lead',
            replyClass: replyClass ?? null,
          })
        }
      } catch (error) {
        result.errors.push(`Email ${email.id}: ${errorMessage(error)}`)
      }
    }
  }

  if (!settings.sending_paused) {
    const { sent, bounced } = await countSendsAndBounces(
      crm,
      new Date(now.getTime() - BOUNCE_WINDOW_DAYS * 86_400_000)
    )
    if (shouldAutoPause(sent, bounced)) {
      const reason = `Paused automatically: ${bounced} of ${sent} emails bounced in the last ${BOUNCE_WINDOW_DAYS} days (over 5%). Clean the list, then turn sending back on.`
      await pauseSending(crm, reason)
      result.paused = reason
    }
  }

  return result
}
