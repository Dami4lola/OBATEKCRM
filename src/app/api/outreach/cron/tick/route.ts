import { NextRequest, NextResponse } from 'next/server'
import { hasValidCronSecret } from '@/lib/api/guards'
import { createAdminClient } from '@/lib/supabase/admin'
import { getMailboxAccess, type MailboxAccess } from '@/lib/email/mailbox'
import { fetchSettings } from '@/lib/outreach/adapters/obatek-crm'
import { auditSignalLeads, draftPending, queueSignalLeads, startDueRuns } from '@/lib/outreach/scheduler'
import { sendDue } from '@/lib/outreach/send-queue'
import { syncInbox } from '@/lib/outreach/inbox-sync'
import { pullSignals } from '@/lib/outreach/signal-pull'

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

// Called every 5 minutes by scripts/outreach-scheduler.mjs (§11): start due
// runs, pull buying signals (once a day) and queue the checked ones, write
// a few drafts, read the mailbox, then send what's due from it.
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

    let settings = await fetchSettings(crm)

    // Once a day: job posts that show a company needs OBATEK now
    const theirStackKey = process.env.THEIRSTACK_API_KEY
    if (theirStackKey) {
      try {
        const signals = await pullSignals(crm, {
          apiKey: theirStackKey,
          settings,
          canClassify: !!process.env.ANTHROPIC_API_KEY,
          now,
        })
        if (!signals.skipped) {
          summary.signals = signals
          settings = await fetchSettings(crm)
        }
      } catch (error) {
        summary.signalError = errorMessage(error)
      }

      // Site checks for new signal leads, then the checked ones into
      // today's Buying signals run (drafted below)
      try {
        const placesKey = process.env.GOOGLE_PLACES_API_KEY
        const audits = await auditSignalLeads(crm, settings, {
          placesKey,
          pagespeedKey: process.env.PAGESPEED_API_KEY || placesKey,
        }, now)
        if (audits.audited || audits.errors.length) summary.signalAudits = audits
        const run = await queueSignalLeads(crm, settings, now)
        if (run.added) summary.signalRun = run
      } catch (error) {
        summary.signalRunError = errorMessage(error)
      }
    }

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
