import { NextRequest, NextResponse } from 'next/server'
import { hasValidCronSecret } from '@/lib/api/guards'
import { createAdminClient } from '@/lib/supabase/admin'
import { getMailboxAccess, type MailboxAccess } from '@/lib/email/mailbox'
import { fetchSettings } from '@/lib/outreach/adapters/obatek-crm'
import { draftPending, startDueRuns } from '@/lib/outreach/scheduler'
import { sendDue } from '@/lib/outreach/send-queue'
import { syncInbox } from '@/lib/outreach/inbox-sync'

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

// Called every 5 minutes by scripts/outreach-scheduler.mjs (§11): start due
// runs, write a few drafts, read the mailbox, then send what's due from it.
// Each part runs even if an earlier one fails.
export async function POST(request: NextRequest) {
  if (!hasValidCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const crm = createAdminClient()
    const now = new Date()
    const summary: Record<string, unknown> = { at: now.toISOString() }

    try {
      summary.started = await startDueRuns(crm, now)
    } catch (error) {
      summary.startError = errorMessage(error)
    }

    const settings = await fetchSettings(crm)

    if (process.env.ANTHROPIC_API_KEY) {
      try {
        const placesKey = process.env.GOOGLE_PLACES_API_KEY
        summary.drafting = await draftPending(crm, settings.cron_drafts_per_tick, {
          placesKey,
          pagespeedKey: process.env.PAGESPEED_API_KEY || placesKey,
        })
      } catch (error) {
        summary.draftError = errorMessage(error)
      }
    } else {
      summary.drafting = 'skipped: ANTHROPIC_API_KEY is not set'
    }

    let mailbox: MailboxAccess | null = null
    try {
      mailbox = await getMailboxAccess(crm)
    } catch (error) {
      summary.mailboxError = errorMessage(error)
    }

    if (mailbox) {
      // Replies, bounces and opt-outs first: a reply stops its sequence
      // before the next send, and a block pauses sending
      try {
        summary.inbox = await syncInbox(crm, {
          mailbox,
          settings,
          canClassify: !!process.env.ANTHROPIC_API_KEY,
          now,
        })
      } catch (error) {
        summary.inboxError = errorMessage(error)
      }

      try {
        // Fresh: the inbox sync may have just paused sending
        summary.sending = await sendDue(crm, {
          mailbox,
          settings: await fetchSettings(crm),
          mailingAddress: process.env.OBATEK_MAILING_ADDRESS,
          now,
        })
      } catch (error) {
        summary.sendError = errorMessage(error)
      }
    }

    return NextResponse.json(summary)
  } catch (error) {
    console.error('Outreach tick error:', error)
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 })
  }
}
