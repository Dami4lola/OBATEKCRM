import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getOutlookAuthUrl } from '@/lib/oauth/outlook'

export async function GET() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.redirect(
        new URL('/login', process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000')
      )
    }

    // State includes user ID for security verification in callback
    const state = Buffer.from(JSON.stringify({ userId: user.id })).toString('base64')
    const authUrl = getOutlookAuthUrl(state)

    return NextResponse.redirect(authUrl)
  } catch (error) {
    console.error('Outlook OAuth init error:', error)
    return NextResponse.redirect(
      new URL(
        '/settings?error=oauth_init_failed',
        process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
      )
    )
  }
}
