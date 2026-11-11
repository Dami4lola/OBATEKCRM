'use client'

import { useState } from 'react'
import { endOfDay, format, startOfDay } from 'date-fns'
import type { DateRange } from 'react-day-picker'
import { CalendarDays } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { ResultsRange } from '@/lib/outreach/results'

export function DateRangePicker({
  range,
  onChange,
}: {
  range: ResultsRange
  onChange: (range: ResultsRange) => void
}) {
  const [open, setOpen] = useState(false)
  // Held here until both ends are picked, so the page doesn't jump mid-choice
  const [picking, setPicking] = useState<DateRange | undefined>()

  const handleOpenChange = (next: boolean) => {
    setPicking(next ? { from: range.from, to: range.to } : undefined)
    setOpen(next)
  }

  const handleSelect = (next: DateRange | undefined, clicked: Date) => {
    // Opened on a full range: the first click starts a new one
    if (picking?.from && picking.to) {
      setPicking({ from: clicked, to: undefined })
      return
    }
    setPicking(next)
    if (next?.from && next.to) {
      onChange({ from: startOfDay(next.from), to: endOfDay(next.to) })
      handleOpenChange(false)
    }
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm">
          <CalendarDays className="mr-2 h-4 w-4" />
          {format(range.from, 'MMM d, yyyy')} – {format(range.to, 'MMM d, yyyy')}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="range"
          numberOfMonths={2}
          defaultMonth={range.from}
          selected={picking}
          onSelect={handleSelect}
          disabled={{ after: new Date() }}
        />
      </PopoverContent>
    </Popover>
  )
}
