import { NextRequest, NextResponse } from 'next/server'
import { hasValidCronSecret } from '@/lib/api/guards'
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchSettings } from '@/lib/outreach/adapters/obatek-crm'
import { draftPending, startDueRuns } from '@/lib/outreach/scheduler'
import { syncStats } from '@/lib/outreach/stats-sync'

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

// Called every 5 minutes by scripts/outreach-scheduler.mjs (§11): start due
// runs, write a few drafts, pull stats from Instantly. Each part runs even
// if an earlier one fails.
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

    const instantlyKey = process.env.INSTANTLY_API_KEY
    if (instantlyKey) {
      try {
        summary.stats = await syncStats(crm, {
          apiKey: instantlyKey,
          settings,
          canClassify: !!process.env.ANTHROPIC_API_KEY,
          now,
        })
      } catch (error) {
        summary.statsError = errorMessage(error)
      }
    } else {
      summary.stats = 'skipped: INSTANTLY_API_KEY is not set'
    }

    return NextResponse.json(summary)
  } catch (error) {
    console.error('Outreach tick error:', error)
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 })
  }
}
