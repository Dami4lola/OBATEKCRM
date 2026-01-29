import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getOutlookTokens, getOutlookUserEmail } from '@/lib/oauth/outlook'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const error = searchParams.get('error')
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

  if (error || !code || !state) {
    console.error('Outlook OAuth callback error:', error)
    return NextResponse.redirect(new URL('/settings?error=oauth_failed', appUrl))
  }

  try {
    const { userId } = JSON.parse(Buffer.from(state, 'base64').toString())
    const supabase = await createClient()

    // Verify the user making this request matches the state
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user || user.id !== userId) {
      throw new Error('User mismatch - possible CSRF attack')
    }

    const tokens = await getOutlookTokens(code)

    if (!tokens.accessToken) {
      throw new Error('Missing access token from Microsoft OAuth')
    }

    const email = await getOutlookUserEmail(tokens.accessToken)

    // For Outlook, we need to get refresh token separately via token endpoint
    // The initial auth code flow with MSAL doesn't always return refresh_token
    // We'll store what we have and handle refresh later
    const { error: dbError } = await supabase.from('email_accounts').upsert(
      {
        user_id: userId,
        provider: 'outlook' as const,
        email_address: email,
        access_token: tokens.accessToken,
        refresh_token: '', // Will be populated on first refresh
        token_expires_at: tokens.expiresOn
          ? tokens.expiresOn.toISOString()
          : new Date(Date.now() + 3600 * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: 'user_id,email_address',
      }
    )

    if (dbError) {
      console.error('Database error:', dbError)
      throw new Error('Failed to save email account')
    }

    return NextResponse.redirect(new URL('/settings?success=email_connected', appUrl))
  } catch (error) {
    console.error('Outlook OAuth callback error:', error)
    return NextResponse.redirect(new URL('/settings?error=oauth_failed', appUrl))
  }
}
