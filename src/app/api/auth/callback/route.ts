import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// Only same-site paths. "//evil.com", "/\evil.com" and "/%09/evil.com" would
// leave the site: URL parsing drops tabs and newlines, so check the result too.
function safeNextPath(next: string | null, origin: string): string {
  if (!next || !next.startsWith('/') || /[\x00-\x1F\x7F\\]/.test(next)) return '/'
  try {
    const resolved = new URL(next, origin)
    if (resolved.origin !== origin) return '/'
    return resolved.pathname + resolved.search + resolved.hash
  } catch {
    return '/'
  }
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = safeNextPath(searchParams.get('next'), origin)

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
