'use client'

import { Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useActiveOutreachRuns } from '@/lib/queries/outreach'
import { useRunOutreach } from './run-outreach-provider'

export function RunOutreachButton() {
  const { openRunOutreach } = useRunOutreach()
  const { data: runs = [] } = useActiveOutreachRuns()

  return (
    <Button onClick={openRunOutreach} className="relative">
      <Send className="mr-2 h-4 w-4" />
      Run outreach
      {runs.length > 0 && (
        <span
          className="absolute -right-2 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1 text-xs font-medium text-white"
          title={`${runs.length} active run${runs.length === 1 ? '' : 's'}`}
        >
          {runs.length}
        </span>
      )}
    </Button>
  )
}
