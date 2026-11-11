import { NextRequest, NextResponse } from 'next/server'
import { hasValidCronSecret } from '@/lib/api/guards'
import { createAdminClient } from '@/lib/supabase/admin'
import { getMailboxAccess, type MailboxAccess } from '@/lib/email/mailbox'
import { fetchSettings } from '@/lib/outreach/adapters/obatek-crm'
import type { OutreachSettings } from '@/lib/outreach/settings'
import { errorMessage } from '@/lib/outreach/errors'
import { auditSignalLeads, draftPending, queueSignalLeads, startDueRuns } from '@/lib/outreach/scheduler'
import { sendDue } from '@/lib/outreach/send-queue'
import { syncInbox } from '@/lib/outreach/inbox-sync'
import { pullSignals } from '@/lib/outreach/signal-pull'

type Crm = ReturnType<typeof createAdminClient>
type Summary = Record<string, unknown>

function auditKeys() {
  const placesKey = process.env.GOOGLE_PLACES_API_KEY
  return { placesKey, pagespeedKey: process.env.PAGESPEED_API_KEY || placesKey }
}

// Once a day: job posts that show a company needs OBATEK now. Returns the
// settings as they now stand, and whether a pull ran.
async function pullBuyingSignals(crm: Crm, settings: OutreachSettings, apiKey: string, now: Date, summary: Summary) {
  let pulledNow = false
  try {
    const signals = await pullSignals(crm, {
      apiKey,
      settings,
      canClassify: !!process.env.ANTHROPIC_API_KEY,
      now,
    })
    if (!signals.skipped) {
      pulledNow = true
      summary.signals = signals
      settings = await fetchSettings(crm)
    }
  } catch (error) {
    summary.signalError = errorMessage(error)
  }
  return { settings, pulledNow }
}

// Site checks for new signal leads, then the checked ones into today's
// Buying signals run (drafted next)
async function auditAndQueueSignals(crm: Crm, settings: OutreachSettings, now: Date, summary: Summary) {
  try {
    const audits = await auditSignalLeads(crm, settings, auditKeys(), now)
    if (audits.audited || audits.errors.length) summary.signalAudits = audits
    const run = await queueSignalLeads(crm, settings, now)
    if (run.added) summary.signalRun = run
  } catch (error) {
    summary.signalRunError = errorMessage(error)
  }
}

async function writeDrafts(crm: Crm, settings: OutreachSettings, pulledNow: boolean, summary: Summary) {
  if (pulledNow) {
    summary.drafting = 'skipped: buying signals pulled this tick'
  } else if (process.env.ANTHROPIC_API_KEY) {
    try {
      summary.drafting = await draftPending(crm, settings.cron_drafts_per_tick, auditKeys())
    } catch (error) {
      summary.draftError = errorMessage(error)
    }
  } else {
    summary.drafting = 'skipped: ANTHROPIC_API_KEY is not set'
  }
}

// Replies, bounces and opt-outs first: a reply stops its sequence before
// the next send, and a block pauses sending
async function readAndSend(crm: Crm, settings: OutreachSettings, now: Date, summary: Summary) {
  let mailbox: MailboxAccess
  try {
    mailbox = await getMailboxAccess(crm)
  } catch (error) {
    summary.mailboxError = errorMessage(error)
    return
  }

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
    summary.sending = await sendDue(crm, {
      mailbox,
      // Fresh: the inbox sync may have just paused sending
      settings: await fetchSettings(crm),
      mailingAddress: process.env.OBATEK_MAILING_ADDRESS,
      now,
    })
  } catch (error) {
    summary.sendError = errorMessage(error)
  }
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
    const summary: Summary = { at: now.toISOString() }

    try {
      summary.started = await startDueRuns(crm, now)
    } catch (error) {
      summary.startError = errorMessage(error)
    }

    let settings = await fetchSettings(crm)

    // A pull can take a few minutes, so that tick leaves site checks and
    // drafting to the next one (the scheduler times a tick out at 4 minutes)
    let pulledNow = false
    const theirStackKey = process.env.THEIRSTACK_API_KEY
    if (theirStackKey) {
      const pull = await pullBuyingSignals(crm, settings, theirStackKey, now, summary)
      settings = pull.settings
      pulledNow = pull.pulledNow
      if (!pulledNow) await auditAndQueueSignals(crm, settings, now, summary)
    }

    await writeDrafts(crm, settings, pulledNow, summary)
    await readAndSend(crm, settings, now, summary)

    return NextResponse.json(summary)
  } catch (error) {
    console.error('Outreach tick error:', error)
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 })
  }
}
