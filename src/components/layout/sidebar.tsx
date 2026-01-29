'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Users, Settings } from 'lucide-react'
import { cn } from '@/lib/utils'

const navItems = [
  {
    title: 'Pipeline',
    href: '/',
    icon: LayoutDashboard,
  },
  {
    title: 'Contacts',
    href: '/contacts',
    icon: Users,
  },
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="hidden w-64 flex-shrink-0 border-r bg-white dark:bg-gray-950 lg:block">
      <div className="flex h-full flex-col">
        {/* Logo */}
        <div className="flex h-16 items-center border-b px-6">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold">
              O
            </div>
            <span className="text-lg font-semibold">Obatek CRM</span>
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 p-4">
          {navItems.map((item) => {
            const isActive = pathname === item.href
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-gray-100 hover:text-foreground dark:hover:bg-gray-800'
                )}
              >
                <item.icon className="h-5 w-5" />
                {item.title}
              </Link>
            )
          })}
        </nav>
      </div>
    </aside>
  )
}
