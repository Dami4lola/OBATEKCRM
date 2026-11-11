'use client'

import { CalendarClock, Zap } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export type RunTiming = 'now' | 'schedule'

interface ScheduleStepProps {
  timing: RunTiming
  onTimingChange: (timing: RunTiming) => void
  scheduledFor: string // datetime-local value
  onScheduledForChange: (value: string) => void
  minScheduledFor: string
  selectedCount: number
  stageName: string
}

export function ScheduleStep({
  timing,
  onTimingChange,
  scheduledFor,
  onScheduledForChange,
  minScheduledFor,
  selectedCount,
  stageName,
}: ScheduleStepProps) {
  const options: {
    value: RunTiming
    title: string
    description: string
    icon: typeof Zap
  }[] = [
    {
      value: 'now',
      title: 'Run now',
      description: `Start with the ${selectedCount} selected lead${selectedCount === 1 ? '' : 's'}.`,
      icon: Zap,
    },
    {
      value: 'schedule',
      title: 'Schedule',
      description: `Runs at the time you pick, on whatever is in ${stageName} then. Leads you unticked stay skipped.`,
      icon: CalendarClock,
    },
  ]

  return (
    <div className="space-y-4">
      <div role="radiogroup" className="grid gap-3 sm:grid-cols-2">
        {options.map(({ value, title, description, icon: Icon }) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={timing === value}
            onClick={() => onTimingChange(value)}
            className={`rounded-lg border p-4 text-left transition-colors ${
              timing === value
                ? 'border-primary ring-2 ring-primary/20'
                : 'hover:bg-muted/50'
            }`}
          >
            <div className="flex items-center gap-2 font-medium">
              <Icon className="h-4 w-4" />
              {title}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          </button>
        ))}
      </div>

      {timing === 'schedule' && (
        <div className="space-y-2">
          <Label htmlFor="outreach-scheduled-for">Run at</Label>
          <Input
            id="outreach-scheduled-for"
            type="datetime-local"
            min={minScheduledFor}
            value={scheduledFor}
            onChange={(e) => onScheduledForChange(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            The CRM and the outreach scheduler need to be running on this
            laptop at that time. If it&apos;s asleep, the run starts when it
            wakes up.
          </p>
        </div>
      )}
    </div>
  )
}
