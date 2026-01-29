import { createBrowserClient } from '@supabase/ssr'
import { Database } from '@/types/database'

function getEnvVars() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      'Missing Supabase environment variables. ' +
      'Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in your .env.local file or Vercel environment variables.'
    )
  }

  return { supabaseUrl, supabaseAnonKey }
}

export function createClient() {
  const { supabaseUrl, supabaseAnonKey } = getEnvVars()
  return createBrowserClient<Database>(supabaseUrl, supabaseAnonKey)
}
