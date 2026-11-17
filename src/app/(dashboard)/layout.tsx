export const dynamic = 'force-dynamic'

import { Sidebar } from '@/components/layout/sidebar'
import { Header } from '@/components/layout/header'
import { QueryProvider } from '@/components/providers/query-provider'
import { Toaster } from 'sonner'
import { NoAccess } from '@/components/layout/no-access'
import { createClient } from '@/lib/supabase/server'

// Database policies are what actually protect the data; this just tells a
// signed-in non-member why everything is empty
async function getTeamAccess() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { allowed: true, email: null }

  const { data: isMember, error } = await supabase.rpc('is_team_member')
  // Fail closed: if the check itself errors, don't show the app
  if (error) {
    console.error('is_team_member check failed:', error.message)
    return { allowed: false, email: user.email ?? null }
  }
  return { allowed: isMember === true, email: user.email ?? null }
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const access = await getTeamAccess()
  if (!access.allowed) return <NoAccess email={access.email} />

  return (
    <QueryProvider>
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <Header />
          <main className="flex-1 overflow-auto bg-gray-50 dark:bg-gray-900 p-6">
            {children}
          </main>
        </div>
      </div>
      <Toaster position="top-right" />
    </QueryProvider>
  )
}
