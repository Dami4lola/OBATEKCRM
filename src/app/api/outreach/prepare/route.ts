import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireTeamMember } from '@/lib/api/guards'
import { prepareEmail, PrepareError } from '@/lib/outreach/prepare-email'

const prepareSchema = z.object({
  emailId: z.string().uuid(),
  // Redraft with the team's feedback; remember = keep it as a writing rule
  feedback: z
    .object({
      note: z.string().trim().min(3, 'Feedback needs a few words').max(500, 'Keep feedback under 500 characters'),
      remember: z.boolean(),
      onlyVertical: z.boolean(),
      // What's on screen now, which may have unsaved edits
      subject: z.string().max(120).optional(),
      opener: z.string().max(600).optional(),
    })
    .optional(),
})

// One lead per request, from the Write step (§8)
export async function POST(request: NextRequest) {
  try {
    const guard = await requireTeamMember()
    if (!guard.ok) return guard.response
    const { supabase } = guard

    const parsed = prepareSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid request' },
        { status: 400 }
      )
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: 'ANTHROPIC_API_KEY is not set in .env.local' },
        { status: 500 }
      )
    }

    const placesKey = process.env.GOOGLE_PLACES_API_KEY
    const result = await prepareEmail(supabase, parsed.data.emailId, {
      feedback: parsed.data.feedback,
      placesKey,
      pagespeedKey: process.env.PAGESPEED_API_KEY || placesKey,
    })
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof PrepareError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('Prepare email error:', error)
    const message = error instanceof Error ? error.message : 'Failed to draft the email'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
