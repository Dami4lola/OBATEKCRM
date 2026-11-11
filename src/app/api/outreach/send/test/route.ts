import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireTeamMember } from '@/lib/api/guards'
import { getMailboxAccess, MailboxError } from '@/lib/email/mailbox'
import { fetchOutreachEmail, fetchSettings } from '@/lib/outreach/adapters/obatek-crm'
import { GraphError } from '@/lib/outreach/graph-client'
import { MessageError } from '@/lib/outreach/mail-message'
import { sendTest } from '@/lib/outreach/send-queue'

const testSchema = z.object({
  emailId: z.string().uuid(),
})

// "Send test to me": email 1 as it would go out, footer included, to the
// connected mailbox itself. Doesn't count toward the daily cap.
export async function POST(request: NextRequest) {
  try {
    const guard = await requireTeamMember()
    if (!guard.ok) return guard.response
    const { supabase } = guard

    const parsed = testSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json({ error: 'emailId must be a uuid' }, { status: 400 })
    }

    const email = await fetchOutreachEmail(supabase, parsed.data.emailId)
    if (!email) return NextResponse.json({ error: 'Email not found' }, { status: 404 })

    const [settings, mailbox] = await Promise.all([fetchSettings(supabase), getMailboxAccess(supabase)])
    await sendTest(supabase, {
      mailbox,
      email,
      settings,
      mailingAddress: process.env.OBATEK_MAILING_ADDRESS,
    })
    return NextResponse.json({ sentTo: mailbox.address })
  } catch (error) {
    if (error instanceof MailboxError || error instanceof MessageError || error instanceof GraphError) {
      return NextResponse.json({ error: error.message }, { status: 409 })
    }
    console.error('Test send error:', error)
    const message = error instanceof Error ? error.message : 'Failed to send the test'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
