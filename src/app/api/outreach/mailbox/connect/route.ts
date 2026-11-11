import { NextResponse } from 'next/server'
import { requireTeamMember } from '@/lib/api/guards'
import { MAILBOX_OAUTH_COOKIE, MailboxError, newMailboxAuthRequest } from '@/lib/email/mailbox'

function settingsUrl(appUrl: string, error: string) {
  return new URL(`/settings?mailbox_error=${error}`, appUrl)
}

// Starts the Microsoft sign-in for the sending mailbox (§16 S11)
export async function GET() {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const guard = await requireTeamMember()
  if (!guard.ok) return NextResponse.redirect(settingsUrl(appUrl, 'access'))

  try {
    const auth = newMailboxAuthRequest()
    const response = NextResponse.redirect(auth.url)
    response.cookies.set(MAILBOX_OAUTH_COOKIE, `${auth.state}.${auth.verifier}`, {
      httpOnly: true,
      sameSite: 'lax',
      secure: appUrl.startsWith('https://'),
      path: '/api/outreach/mailbox',
      maxAge: 600,
    })
    return response
  } catch (error) {
    if (error instanceof MailboxError) return NextResponse.redirect(settingsUrl(appUrl, 'config'))
    console.error('Mailbox connect error:', error)
    return NextResponse.redirect(settingsUrl(appUrl, 'failed'))
  }
}
