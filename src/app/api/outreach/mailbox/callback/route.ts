import { timingSafeEqual } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { requireTeamMember } from '@/lib/api/guards'
import { exchangeMailboxCode, MAILBOX_OAUTH_COOKIE, saveConnectedMailbox } from '@/lib/email/mailbox'
import { fetchSettings } from '@/lib/outreach/adapters/obatek-crm'
import { getMailboxAddress } from '@/lib/outreach/graph-client'

function sameString(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && timingSafeEqual(left, right)
}

// Microsoft redirects here after sign-in. Only fixed error codes go back
// to the page, never Microsoft's text.
export async function GET(request: NextRequest) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const finish = (query: string) => {
    const response = NextResponse.redirect(new URL(`/settings?${query}`, appUrl))
    response.cookies.set(MAILBOX_OAUTH_COOKIE, '', { path: '/api/outreach/mailbox', maxAge: 0 })
    return response
  }

  const params = request.nextUrl.searchParams
  if (params.get('error')) return finish('mailbox_error=denied')

  const [expectedState, verifier] = (request.cookies.get(MAILBOX_OAUTH_COOKIE)?.value ?? '').split('.')
  const state = params.get('state') ?? ''
  const code = params.get('code') ?? ''
  if (!expectedState || !verifier || !code || !sameString(state, expectedState)) {
    return finish('mailbox_error=state')
  }

  const guard = await requireTeamMember()
  if (!guard.ok) return finish('mailbox_error=access')
  const { supabase } = guard

  try {
    const tokens = await exchangeMailboxCode(code, verifier)
    const address = await getMailboxAddress(tokens.accessToken)

    // Only the cold-outreach domain, never the main business mailbox
    const settings = await fetchSettings(supabase)
    const domain = settings.sending_domain.trim().toLowerCase()
    if (!domain || !address.endsWith(`@${domain}`)) return finish('mailbox_error=domain')

    await saveConnectedMailbox(supabase, address, tokens.refreshToken)
    return finish('mailbox=connected')
  } catch (error) {
    console.error('Mailbox callback error:', error instanceof Error ? error.message : error)
    return finish('mailbox_error=failed')
  }
}
