'use client'

import { format } from 'date-fns'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  useActiveOutreachRuns,
  useCancelOutreachRun,
} from '@/lib/queries/outreach'
import type { OutreachRunStatus } from '@/types/database'

const STATUS_LABELS: Record<OutreachRunStatus, string> = {
  scheduled: 'Scheduled',
  preparing: 'Preparing',
  awaiting_review: 'Ready for review',
  sending: 'Sending',
  completed: 'Completed',
  failed: 'Failed',
  cancelled: 'Cancelled',
}

// Runs that have drafts to write or review
const REVIEWABLE: OutreachRunStatus[] = ['preparing', 'awaiting_review']

export function ActiveRuns({ onReview }: { onReview?: (runId: string) => void }) {
  const { data: runs = [] } = useActiveOutreachRuns()
  const cancelRun = useCancelOutreachRun()

  if (runs.length === 0) return null

  const handleCancel = async (id: string) => {
    try {
      await cancelRun.mutateAsync(id)
      toast.success('Run cancelled')
    } catch {
      toast.error('Failed to cancel run')
    }
  }

  return (
    <div className="space-y-2">
      <h4 className="text-sm font-medium">Active runs</h4>
      <div className="rounded-md border divide-y">
        {runs.map((run) => (
          <div key={run.id} className="flex items-center justify-between gap-2 px-3 py-2">
            <div className="flex items-center gap-2 text-sm">
              <Badge variant={run.status === 'scheduled' ? 'outline' : 'secondary'}>
                {STATUS_LABELS[run.status]}
              </Badge>
              <span>{format(new Date(run.scheduled_for), 'PPp')}</span>
              <span className="text-xs text-muted-foreground">{run.mode}</span>
            </div>
            <div className="flex items-center gap-1">
            {onReview && REVIEWABLE.includes(run.status) && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2"
                onClick={() => onReview(run.id)}
              >
                Review
              </Button>
            )}
            {run.status !== 'sending' && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-destructive"
                disabled={cancelRun.isPending}
                onClick={() => handleCancel(run.id)}
              >
                Cancel
              </Button>
            )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
