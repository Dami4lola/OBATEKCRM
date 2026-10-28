import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// Only same-site paths: "//evil.com" or "/\evil.com" would leave the site
function safeNextPath(next: string | null): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) {
    return '/'
  }
  return next
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = safeNextPath(searchParams.get('next'))

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(new URL(next, origin))
    }
  }

  // Expired or already-used password reset link: let them request another
  if (next === '/reset-password') {
    return NextResponse.redirect(`${origin}/forgot-password?expired=1`)
  }

  return NextResponse.redirect(`${origin}/login?error=Could not authenticate`)
}
