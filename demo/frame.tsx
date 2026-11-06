'use client'

import { useSyncExternalStore } from 'react'
import { Toaster } from 'sonner'
import { BarChart3, CalendarDays, LayoutDashboard, Users } from 'lucide-react'
import { Header } from '@/components/layout/header'
import { Sidebar, type NavItem } from '@/components/layout/sidebar'
import { QueryProvider } from '@/components/providers/query-provider'
import { Tips } from './tips'

// Stands in for src/app/(dashboard)/layout.tsx in the demo build

const DEMO_LINKS: NavItem[] = [
  { title: 'Results', href: '/', icon: BarChart3 },
  { title: 'Pipeline', href: '/pipeline/', icon: LayoutDashboard },
  { title: 'Contacts', href: '/contacts/', icon: Users },
  { title: 'Meetings', href: '/meetings/', icon: CalendarDays },
]

const noChanges = () => () => {}

export default function DemoFrame({ children }: { children: React.ReactNode }) {
  // Screens depend on today's date, so they render in the visitor's browser,
  // not when the files were built
  const inBrowser = useSyncExternalStore(noChanges, () => true, () => false)

  return (
    <QueryProvider>
      <div className="flex h-screen flex-col overflow-hidden">
        <div className="bg-amber-100 px-4 py-2 text-center text-sm font-medium text-amber-950">
          Demo data. Every business, email and result here is made up.
        </div>
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <Sidebar items={DEMO_LINKS} />
          <div className="flex flex-1 flex-col overflow-hidden">
            <Header items={DEMO_LINKS} />
            <main className="flex-1 overflow-auto bg-gray-50 p-6 dark:bg-gray-900">{inBrowser && children}</main>
          </div>
        </div>
      </div>
      <Tips />
      <Toaster position="top-right" />
    </QueryProvider>
  )
}
