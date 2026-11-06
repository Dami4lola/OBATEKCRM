'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BarChart3, LayoutDashboard, Menu, Users, CalendarDays, Settings, type LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'

export interface NavItem {
  title: string
  href: string
  icon: LucideIcon
}

export const navItems: NavItem[] = [
  {
    title: 'Results',
    href: '/results',
    icon: BarChart3,
  },
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
  {
    title: 'Meetings',
    href: '/meetings',
    icon: CalendarDays,
  },
  {
    title: 'Settings',
    href: '/settings',
    icon: Settings,
  },
]

function Logo({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="flex h-16 items-center border-b px-6">
      <Link href="/" className="flex items-center gap-2" onClick={onNavigate}>
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold">
          O
        </div>
        <span className="text-lg font-semibold">Obatek CRM</span>
      </Link>
    </div>
  )
}

function NavLinks({ items, onNavigate }: { items: NavItem[]; onNavigate?: () => void }) {
  const pathname = usePathname()

  return (
    <nav className="flex-1 space-y-1 p-4">
      {items.map((item) => {
        const isActive = pathname === item.href
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
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
  )
}

export function Sidebar({ items = navItems }: { items?: NavItem[] }) {
  return (
    <aside className="hidden w-64 flex-shrink-0 border-r bg-white dark:bg-gray-950 lg:block">
      <div className="flex h-full flex-col">
        <Logo />
        <NavLinks items={items} />
      </div>
    </aside>
  )
}

// The sidebar is hidden on phones and small tablets, so they get the same
// links from a menu button in the header
export function MobileNav({ items = navItems }: { items?: NavItem[] }) {
  const [open, setOpen] = useState(false)
  const close = () => setOpen(false)

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open menu">
          <Menu className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-64 gap-0 p-0" aria-describedby={undefined}>
        <SheetTitle className="sr-only">Menu</SheetTitle>
        <Logo onNavigate={close} />
        <NavLinks items={items} onNavigate={close} />
      </SheetContent>
    </Sheet>
  )
}
