'use client'

import { useMemo, useState } from 'react'
import { addDays, format, setHours, setMinutes } from 'date-fns'
import { toast } from 'sonner'
import { CheckCircle2, Loader2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  useCreateOutreachRun,
  useOutreachGather,
  type GatherRow,
} from '@/lib/queries/outreach'
import { GatherStep } from './gather-step'
import { ScheduleStep, type RunTiming } from './schedule-step'
import { ActiveRuns } from './active-runs'

type Step = 'gather' | 'when' | 'done'

const DATETIME_LOCAL = "yyyy-MM-dd'T'HH:mm"

function isDefaultSelected(row: GatherRow) {
  return !row.blocked && !row.belowThreshold
}

interface OutreachRunDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function OutreachRunDialog({ open, onOpenChange }: OutreachRunDialogProps) {
  const [step, setStep] = useState<Step>('gather')
  // Leads ticked or unticked by hand, away from their default, so the
  // defaults apply without an effect
  const [toggledIds, setToggledIds] = useState<Set<string>>(new Set())
  const [timing, setTiming] = useState<RunTiming>('now')
  const [scheduledFor, setScheduledFor] = useState('')
  const [minScheduledFor, setMinScheduledFor] = useState('')
  // Leads added by a Run now; the gather query refetches after the run is created
  const [startedCount, setStartedCount] = useState<number | null>(null)

  const gather = useOutreachGather(open)
  const createRun = useCreateOutreachRun()

  const rows = useMemo(() => gather.data?.rows ?? [], [gather.data])
  const selectedIds = useMemo(
    () =>
      new Set(
        rows
          .filter((row) => !row.blocked && isDefaultSelected(row) !== toggledIds.has(row.lead.id))
          .map((row) => row.lead.id)
      ),
    [rows, toggledIds]
  )
  const stageName = gather.data?.stage.name ?? 'New'

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setStep('gather')
      setToggledIds(new Set())
      setTiming('now')
      setScheduledFor('')
      setStartedCount(null)
    }
    onOpenChange(nextOpen)
  }

  const handleToggle = (leadId: string, checked: boolean) => {
    const row = rows.find((r) => r.lead.id === leadId)
    if (!row) return
    setToggledIds((prev) => {
      const next = new Set(prev)
      if (checked === isDefaultSelected(row)) next.delete(leadId)
      else next.add(leadId)
      return next
    })
  }

  const handleToggleAll = (checked: boolean) => {
    setToggledIds(
      new Set(
        rows
          .filter((row) => isDefaultSelected(row) !== checked)
          .map((row) => row.lead.id)
      )
    )
  }

  const handleTimingChange = (next: RunTiming) => {
    setTiming(next)
    if (next === 'schedule') {
      const now = new Date()
      setMinScheduledFor(format(now, DATETIME_LOCAL))
      if (!scheduledFor) {
        // Default to 9:00 tomorrow
        setScheduledFor(format(setMinutes(setHours(addDays(now, 1), 9), 0), DATETIME_LOCAL))
      }
    }
  }

  const handleSubmit = async () => {
    if (!gather.data) return

    let runAt: Date | null = null
    if (timing === 'schedule') {
      runAt = new Date(scheduledFor)
      if (isNaN(runAt.getTime()) || runAt <= new Date()) {
        toast.error('Pick a time in the future')
        return
      }
    }

    try {
      await createRun.mutateAsync({
        rows,
        selectedIds,
        scheduledFor: runAt,
        mode: gather.data.settings.mode,
      })
      if (runAt) {
        toast.success(`Outreach scheduled for ${format(runAt, 'PPp')}`)
        handleOpenChange(false)
      } else {
        setStartedCount(selectedIds.size)
        setStep('done')
      }
    } catch (error) {
      toast.error('Failed to start the run')
      console.error('Outreach run error:', error)
    }
  }

  const submitDisabled =
    createRun.isPending ||
    (timing === 'now' && selectedIds.size === 0) ||
    (timing === 'schedule' && !scheduledFor)

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <DialogTitle>
              {step === 'gather' && 'Run outreach'}
              {step === 'when' && 'When should it run?'}
              {step === 'done' && 'Run started'}
            </DialogTitle>
            {gather.data && (
              <Badge variant="outline">{gather.data.settings.mode} mode</Badge>
            )}
          </div>
          {step === 'gather' && (
            <DialogDescription>
              Leads in {stageName} get a cold email sequence and move to{' '}
              {gather.data?.settings.target_stage_name ?? 'Contacted'} once the
              first email is sent.
            </DialogDescription>
          )}
        </DialogHeader>

        <div className="space-y-6">
          {step === 'gather' && (
            <>
              {gather.isLoading && (
                <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Gathering leads...
                </div>
              )}
              {gather.error && (
                <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                  {gather.error.message}
                </div>
              )}
              {gather.data && (
                <GatherStep
                  rows={rows}
                  settings={gather.data.settings}
                  stageName={stageName}
                  selectedIds={selectedIds}
                  onToggle={handleToggle}
                  onToggleAll={handleToggleAll}
                />
              )}
              <ActiveRuns />
            </>
          )}

          {step === 'when' && (
            <ScheduleStep
              timing={timing}
              onTimingChange={handleTimingChange}
              scheduledFor={scheduledFor}
              onScheduledForChange={setScheduledFor}
              minScheduledFor={minScheduledFor}
              selectedCount={selectedIds.size}
              stageName={stageName}
            />
          )}

          {step === 'done' && startedCount !== null && (
            <div className="space-y-2 py-4 text-center">
              <CheckCircle2 className="mx-auto h-10 w-10 text-green-600" />
              <p className="font-medium">
                {startedCount} lead{startedCount === 1 ? '' : 's'} added
                to this run
              </p>
              <p className="text-sm text-muted-foreground">
                The writing step isn&apos;t built yet. This run stays under
                Active runs until it is, and the leads stay in {stageName}.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          {step === 'gather' && (
            <>
              <Button variant="outline" onClick={() => handleOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={() => setStep('when')} disabled={!gather.data}>
                Next
              </Button>
            </>
          )}
          {step === 'when' && (
            <>
              <Button
                variant="outline"
                onClick={() => setStep('gather')}
                disabled={createRun.isPending}
              >
                Back
              </Button>
              <Button onClick={handleSubmit} disabled={submitDisabled}>
                {createRun.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                {timing === 'now' ? 'Start run' : 'Schedule run'}
              </Button>
            </>
          )}
          {step === 'done' && (
            <Button onClick={() => handleOpenChange(false)}>Close</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
