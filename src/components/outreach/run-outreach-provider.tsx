'use client'

import { createContext, useContext, useMemo, useState } from 'react'
import { OutreachRunDialog } from './outreach-run-dialog'

interface RunOutreachContextValue {
  openRunOutreach: () => void
}

const RunOutreachContext = createContext<RunOutreachContextValue | null>(null)

// Lets the page header button and the New column both open the one dialog
export function RunOutreachProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const value = useMemo(() => ({ openRunOutreach: () => setOpen(true) }), [])

  return (
    <RunOutreachContext.Provider value={value}>
      {children}
      <OutreachRunDialog open={open} onOpenChange={setOpen} />
    </RunOutreachContext.Provider>
  )
}

export function useRunOutreach() {
  const context = useContext(RunOutreachContext)
  if (!context) {
    throw new Error('useRunOutreach must be used inside RunOutreachProvider')
  }
  return context
}
