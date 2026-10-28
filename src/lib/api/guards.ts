import { timingSafeEqual } from 'crypto'
import { NextResponse } from 'next/server'
import type { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'

type ServerSupabase = Awaited<ReturnType<typeof createClient>>

export type TeamGuardResult =
  | { ok: true; supabase: ServerSupabase; user: User }
  | { ok: false; response: NextResponse }

// For routes that cost money or contact people: signed in AND on the team.
// The returned client acts as that user, so RLS still applies to every query.
export async function requireTeamMember(): Promise<TeamGuardResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { ok: false, response: NextResponse.json({ error: 'Not signed in' }, { status: 401 }) }
  }

  const { data: isMember, error } = await supabase.rpc('is_team_member')
  if (error || !isMember) {
    return { ok: false, response: NextResponse.json({ error: 'No access' }, { status: 403 }) }
  }

  return { ok: true, supabase, user }
}

// For the local scheduler: Authorization: Bearer $CRON_SECRET.
// Fails closed when the secret isn't configured.
export function hasValidCronSecret(request: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false

  const header = request.headers.get('authorization') ?? ''
  const expected = Buffer.from(`Bearer ${secret}`)
  const actual = Buffer.from(header)
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}
