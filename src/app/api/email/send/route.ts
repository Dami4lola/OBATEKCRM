import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendOutlookEmail } from '@/lib/email/outlook-sender'
import { z } from 'zod'

const sendEmailSchema = z.object({
  emailAccountId: z.string().uuid(),
  leadId: z.string().uuid(),
  to: z.string().email(),
  subject: z.string().min(1),
  body: z.string().min(1),
})

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const rawBody = await request.json()
    const parseResult = sendEmailSchema.safeParse(rawBody)

    if (!parseResult.success) {
      return NextResponse.json(
        { error: parseResult.error.issues.map((i) => i.message).join(', ') },
        { status: 400 }
      )
    }

    const { emailAccountId, leadId, to, subject, body } = parseResult.data

    // Get email account
    const { data: account, error: accountError } = await supabase
      .from('email_accounts')
      .select('*')
      .eq('id', emailAccountId)
      .eq('user_id', user.id)
      .single()

    if (accountError || !account) {
      return NextResponse.json({ error: 'Email account not found' }, { status: 404 })
    }

    // Send email via Outlook
    const result = await sendOutlookEmail(account, to, subject, body)

    // Log the email
    await supabase.from('email_logs').insert({
      email_account_id: emailAccountId,
      lead_id: leadId,
      subject,
      body,
      status: result.success ? 'sent' : 'failed',
      error_message: result.error || null,
    })

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Send email error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
