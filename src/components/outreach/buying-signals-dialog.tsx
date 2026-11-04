'use client'

import { useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { toast } from 'sonner'
import { ExternalLink, Loader2, Radar } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useOutreachSettings } from '@/lib/queries/outreach'
import { usePullSignals, useRecentSignals } from '@/lib/queries/signals'
import { startOfLocalDay } from '@/lib/outreach/sequence'
import type { LeadSignal } from '@/types/database'

const STATUS_LABELS: Record<LeadSignal['status'], string> = {
  new: 'Waiting for the fit check',
  lead_created: 'Added to New',
  matched_existing: 'Already a lead: tagged',
  discarded: 'Skipped',
}

function SignalRow({ signal }: { signal: LeadSignal }) {
  const fit = signal.fit === 'fit'
  return (
    <div className="space-y-1 rounded-md border p-3 text-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-medium">{signal.company_name || signal.company_domain || 'Unknown company'}</p>
          <p className="text-muted-foreground">
            Hiring: {signal.job_title}
            {signal.location && ` · ${signal.location}`}
            {signal.employee_count != null && ` · ${signal.employee_count} staff`}
          </p>
        </div>
        <Badge variant={fit ? 'default' : 'secondary'} className="shrink-0">
          {signal.fit === 'pending' ? 'Not checked' : fit ? 'Fit' : 'Not a fit'}
        </Badge>
      </div>
      {signal.fit_reason && <p className="text-xs text-muted-foreground">{signal.fit_reason}</p>}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span>{STATUS_LABELS[signal.status]}</span>
        {signal.posted_at && <span>Posted {signal.posted_at}</span>}
        {signal.job_url && (
          <a
            href={signal.job_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 underline-offset-2 hover:underline"
          >
            Job post <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>
    </div>
  )
}

// Today's job-post signals (OUTREACH_PLAN.md §3): what was pulled, what
// the fit check thought, and which ones became leads
export function BuyingSignalsDialog() {
  const [open, setOpen] = useState(false)
  const [showSkipped, setShowSkipped] = useState(false)
  const signals = useRecentSignals(open)
  const { data: settings } = useOutreachSettings()
  const pull = usePullSignals()

  const rows = signals.data ?? []
  const fits = rows.filter((s) => s.fit === 'fit')
  const others = rows.filter((s) => s.fit !== 'fit')
  const dailyJobs = settings?.signal_regions.reduce((sum, r) => sum + Math.max(0, r.daily_jobs), 0) ?? 0
  const todayStart = settings ? startOfLocalDay(new Date(), settings.send_timezone).getTime() : 0
  const usedToday = rows.filter(
    (s) => s.source === 'theirstack' && new Date(s.created_at).getTime() >= todayStart
  ).length

  const handlePull = async () => {
    try {
      const result = await pull.mutateAsync()
      if (result.errors.length) toast.error(result.errors[0])
      if (result.fetched === 0 && result.errors.length) return
      toast.success(
        `${result.fetched} job posts pulled: ${result.fit} fit, ${result.leadsCreated} new leads, ${result.matched} already in the CRM`
      )
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to pull buying signals')
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Radar className="mr-2 h-4 w-4" />
          Buying signals
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Buying signals</DialogTitle>
          <DialogDescription>
            Small companies hiring an appointment setter, SDR, lead-gen specialist, CRM admin or GoHighLevel person.
            Pulled from TheirStack once a day after {settings?.signal_pull_hour ?? 7}:00; fit ones go to New and get
            checked and drafted like any other lead.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            {usedToday} of {dailyJobs} job posts pulled today (1 TheirStack credit each)
            {settings?.signals_pulled_at &&
              ` · last pull ${formatDistanceToNow(new Date(settings.signals_pulled_at), { addSuffix: true })}`}
          </p>
          <Button size="sm" onClick={handlePull} disabled={pull.isPending}>
            {pull.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Pull now
          </Button>
        </div>

        {signals.isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : signals.error ? (
          <p className="text-sm text-destructive">
            Couldn&apos;t load signals. Has 017_buying_signals.sql been run?
          </p>
        ) : rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No job posts in the last 7 days. Set THEIRSTACK_API_KEY in .env.local, then Pull now.
          </p>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <h4 className="text-sm font-medium">Fit ({fits.length})</h4>
              {fits.length === 0 ? (
                <p className="text-sm text-muted-foreground">None this week yet.</p>
              ) : (
                fits.map((signal) => <SignalRow key={signal.id} signal={signal} />)
              )}
            </div>
            {others.length > 0 && (
              <div className="space-y-2">
                <button
                  type="button"
                  className="text-sm font-medium text-muted-foreground hover:text-foreground"
                  onClick={() => setShowSkipped((v) => !v)}
                >
                  {showSkipped ? 'Hide' : 'Show'} skipped and unchecked ({others.length})
                </button>
                {showSkipped && others.map((signal) => <SignalRow key={signal.id} signal={signal} />)}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
