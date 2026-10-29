import 'server-only'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

// Service-role client: bypasses row-level security. Only the scheduler's
// cron route uses it, behind CRON_SECRET (OUTREACH_PLAN.md §16 S5). Never
// import it from client code or prefix the key with NEXT_PUBLIC_.
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set in .env.local (the outreach scheduler needs it)')
  }
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
