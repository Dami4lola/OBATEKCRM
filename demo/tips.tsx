'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Lightbulb, X } from 'lucide-react'
import { Button } from '@/components/ui/button'

// A short guide for website visitors, in the same order as a screen share.
// Closing it stays closed until they reopen it or refresh.

const STEPS: { title: string; text: string; href: string; link: string }[] = [
  {
    title: 'See what is working',
    text: 'Results shows replies, meetings and what worked best. Try changing the dates.',
    href: '/',
    link: 'Open Results',
  },
  {
    title: 'Follow every lead',
    text: 'The pipeline holds every lead by stage. Drag a card to move it.',
    href: '/pipeline/',
    link: 'Open Pipeline',
  },
  {
    title: 'Look inside a lead',
    text: 'Click any lead to see its score and what the check of its website found.',
    href: '/pipeline/',
    link: 'Open Pipeline',
  },
  {
    title: 'Find new leads',
    text: 'Open Find leads and Buying signals to see where leads come from. Searches are off in the demo.',
    href: '/pipeline/',
    link: 'Open Pipeline',
  },
  {
    title: 'Review the drafts',
    text: 'Open Run outreach, then press Review on the run that is waiting, to read each email.',
    href: '/pipeline/',
    link: 'Open Pipeline',
  },
  {
    title: 'Approve an email',
    text: 'Edit a draft and approve it. In the real app, approved emails go out from your own mailbox.',
    href: '/pipeline/',
    link: 'Open Pipeline',
  },
]

export function Tips() {
  const [open, setOpen] = useState(true)
  const [index, setIndex] = useState(0)
  const step = STEPS[index]

  if (!open) {
    return (
      <Button variant="outline" size="sm" className="fixed right-4 bottom-4 z-40 shadow" onClick={() => setOpen(true)}>
        <Lightbulb className="mr-1 h-4 w-4" />
        Tips
      </Button>
    )
  }

  return (
    <aside
      aria-label="Demo tips"
      className="fixed right-4 bottom-4 z-40 w-80 max-w-[calc(100vw-2rem)] rounded-lg border bg-background p-4 shadow-lg"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Tip {index + 1} of {STEPS.length}
        </p>
        <button type="button" aria-label="Close tips" className="text-muted-foreground hover:text-foreground" onClick={() => setOpen(false)}>
          <X className="h-4 w-4" />
        </button>
      </div>
      <p className="mt-1 font-medium">{step.title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{step.text}</p>
      <div className="mt-3 flex items-center justify-between gap-2">
        <Link href={step.href} className="text-sm underline underline-offset-2">
          {step.link}
        </Link>
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" disabled={index === 0} onClick={() => setIndex(index - 1)}>
            Back
          </Button>
          <Button size="sm" onClick={() => (index === STEPS.length - 1 ? setOpen(false) : setIndex(index + 1))}>
            {index === STEPS.length - 1 ? 'Done' : 'Next'}
          </Button>
        </div>
      </div>
    </aside>
  )
}
