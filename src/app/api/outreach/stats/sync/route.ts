import { NextResponse } from 'next/server'
import { requireTeamMember } from '@/lib/api/guards'
import { getMailboxAccess, MailboxError } from '@/lib/email/mailbox'
import { fetchSettings } from '@/lib/outreach/adapters/obatek-crm'
import { syncInbox, type SyncResult } from '@/lib/outreach/inbox-sync'

// Reading the inbox again within this long is skipped, so reopening the
// pop-up is cheap
const THROTTLE_MS = 2 * 60_000

const EMPTY: SyncResult = { checked: 0, updated: 0, newReplies: [], suppressed: 0, paused: null, errors: [] }

// Reads replies, bounces and opt-outs from the mailbox when the pop-up
// opens (§11), so they show without waiting for the scheduler
export async function POST() {
  try {
    const guard = await requireTeamMember()
    if (!guard.ok) return guard.response
    const { supabase } = guard

    let mailbox
    try {
      mailbox = await getMailboxAccess(supabase)
    } catch (error) {
      // No mailbox yet, or it needs reconnecting: Settings says so
      if (error instanceof MailboxError) return NextResponse.json(EMPTY)
      throw error
    }
    if (mailbox.inboxCheckedAt && Date.now() - new Date(mailbox.inboxCheckedAt).getTime() < THROTTLE_MS) {
      return NextResponse.json(EMPTY)
    }

    const settings = await fetchSettings(supabase)
    const result = await syncInbox(supabase, {
      mailbox,
      settings,
      canClassify: !!process.env.ANTHROPIC_API_KEY,
    })
    return NextResponse.json(result)
  } catch (error) {
    console.error('Inbox sync error:', error)
    const message = error instanceof Error ? error.message : 'Failed to read the mailbox'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
