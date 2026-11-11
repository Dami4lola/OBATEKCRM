import { NextResponse } from 'next/server'
import { requireTeamMember } from '@/lib/api/guards'
import { countSignalsSince, fetchSettings } from '@/lib/outreach/adapters/obatek-crm'
import { startOfLocalDay } from '@/lib/outreach/sequence'
import { pullSignals } from '@/lib/outreach/signal-pull'

// A second press within this long is refused: each pull spends credits
const MIN_GAP_MS = 10 * 60_000

// The Buying signals dialog's Pull now (§3): today's pull without waiting
// for the scheduler. Credits are capped at two days' worth a day.
export async function POST() {
  try {
    const guard = await requireTeamMember()
    if (!guard.ok) return guard.response
    const { supabase } = guard

    const apiKey = process.env.THEIRSTACK_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'THEIRSTACK_API_KEY is not set in .env.local' }, { status: 400 })
    }

    const settings = await fetchSettings(supabase)
    const now = new Date()
    if (settings.signals_pulled_at && now.getTime() - new Date(settings.signals_pulled_at).getTime() < MIN_GAP_MS) {
      return NextResponse.json({ error: 'Pulled less than 10 minutes ago. Try again shortly.' }, { status: 429 })
    }
    const dailyJobs = settings.signal_regions.reduce((sum, r) => sum + Math.max(0, r.daily_jobs), 0)
    const usedToday = await countSignalsSince(supabase, startOfLocalDay(now, settings.send_timezone))
    if (usedToday >= dailyJobs * 2) {
      return NextResponse.json(
        { error: `Daily limit reached: ${usedToday} job posts pulled today. Try again tomorrow.` },
        { status: 429 }
      )
    }

    const result = await pullSignals(supabase, {
      apiKey,
      settings,
      canClassify: !!process.env.ANTHROPIC_API_KEY,
      now,
      force: true,
    })
    return NextResponse.json(result)
  } catch (error) {
    console.error('Signal pull error:', error)
    const message = error instanceof Error ? error.message : 'Failed to pull buying signals'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
