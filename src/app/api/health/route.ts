import { NextResponse } from 'next/server'

// Railway's deploy check (OUTREACH_PLAN.md §14). No database call: it only
// proves the server is up, so a short Supabase blip never restarts the app.
export function GET() {
  return NextResponse.json({ ok: true })
}
