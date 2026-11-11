'use client'

import { format } from 'date-fns'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useMarkPlacement, useSeedChecks } from '@/lib/queries/write'
import type { SeedPlacement } from '@/types/database'

const PLACEMENTS: { value: SeedPlacement; label: string }[] = [
  { value: 'inbox', label: 'Inbox' },
  { value: 'promotions', label: 'Promotions' },
  { value: 'spam', label: 'Spam' },
  { value: 'missing', label: 'Not there' },
]

// Copies of the day's first email sent to your own Gmail/Outlook inboxes
// (seed_addresses). Mark where each landed; spam holds the warm-up ramp.
export function SeedChecks() {
  const { data: checks = [] } = useSeedChecks()
  const mark = useMarkPlacement()

  if (checks.length === 0) return null

  return (
    <div className="space-y-2">
      <h4 className="text-sm font-medium">Where did the seed copies land?</h4>
      <div className="divide-y rounded-md border">
        {checks.map((check) => (
          <div key={check.id} className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 px-3 py-1.5 text-sm">
            <span className="truncate">
              {check.to_address}
              <span className="text-xs text-muted-foreground"> · {format(new Date(check.sent_at), 'EEE MMM d, h:mm a')}</span>
            </span>
            <div className="flex gap-1">
              {PLACEMENTS.map(({ value, label }) => (
                <Button
                  key={value}
                  size="sm"
                  variant={value === 'spam' ? 'destructive' : 'outline'}
                  className="h-7 px-2 text-xs"
                  disabled={mark.isPending}
                  onClick={() =>
                    mark
                      .mutateAsync({ id: check.id, placement: value })
                      .catch((error) => toast.error(error instanceof Error ? error.message : 'Failed to save'))
                  }
                >
                  {label}
                </Button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
