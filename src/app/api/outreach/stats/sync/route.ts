import { NextResponse } from 'next/server'
import { requireTeamMember } from '@/lib/api/guards'
import { fetchSettings } from '@/lib/outreach/adapters/obatek-crm'
import { syncStats, type SyncResult } from '@/lib/outreach/stats-sync'

// Pulls stats from Instantly when the pop-up opens (§11). Only emails not
// synced in the last 15 minutes are asked about, so reopening is cheap.
export async function POST() {
  try {
    const guard = await requireTeamMember()
    if (!guard.ok) return guard.response
    const { supabase } = guard

    const apiKey = process.env.INSTANTLY_API_KEY
    if (!apiKey) {
      const empty: SyncResult = { checked: 0, updated: 0, newReplies: [], suppressed: 0, paused: null, errors: [] }
      return NextResponse.json(empty)
    }

    const settings = await fetchSettings(supabase)
    const result = await syncStats(supabase, {
      apiKey,
      settings,
      canClassify: !!process.env.ANTHROPIC_API_KEY,
    })
    return NextResponse.json(result)
  } catch (error) {
    console.error('Stats sync error:', error)
    const message = error instanceof Error ? error.message : 'Failed to sync stats'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
