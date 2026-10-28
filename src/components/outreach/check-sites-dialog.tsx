'use client'

import { useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Loader2, ScanSearch } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { requestLeadAudit, useLeadsToCheck } from '@/lib/queries/outreach'
import { primaryHook } from '@/lib/outreach/audit-findings'
import type { Lead } from '@/types/database'

// Several at once, but few enough to stay polite to Google and the sites
const CONCURRENCY = 3

interface Progress {
  total: number
  done: number
  failed: number
  emailsFound: number
  foundOnGoogle: number
  unknownSite: number
  noSite: number
  noBooking: number
  slowCallbacks: number
  lastError: string | null
}

const EMPTY_PROGRESS: Progress = {
  total: 0,
  done: 0,
  failed: 0,
  emailsFound: 0,
  foundOnGoogle: 0,
  unknownSite: 0,
  noSite: 0,
  noBooking: 0,
  slowCallbacks: 0,
  lastError: null,
}

export function CheckSitesDialog() {
  const [open, setOpen] = useState(false)
  const [checkReviews, setCheckReviews] = useState(false)
  const [lookupListing, setLookupListing] = useState(true)
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<Progress | null>(null)
  const stopRef = useRef(false)
  const queryClient = useQueryClient()

  const toCheck = useLeadsToCheck(open && !running && !progress)
  const leads = toCheck.data?.leads ?? []
  const placesLeads = leads.filter((lead) => lead.google_place_id).length
  const missingWebsite = leads.filter((lead) => !lead.website && !lead.google_place_id).length

  const handleOpenChange = (nextOpen: boolean) => {
    if (running) return
    if (!nextOpen) setProgress(null)
    setOpen(nextOpen)
  }

  const checkLead = async (lead: Lead) => {
    try {
      // The list only holds leads that need a check, including ones checked
      // recently under the old rules, so skip the "checked recently" shortcut
      const result = await requestLeadAudit({ leadId: lead.id, checkReviews, lookupListing, force: true })
      const audit = result.audit
      setProgress((p) =>
        p && {
          ...p,
          done: p.done + 1,
          emailsFound: p.emailsFound + (!lead.email && result.lead.email ? 1 : 0),
          foundOnGoogle:
            p.foundOnGoogle + (audit?.listing && audit.website_status === 'found' ? 1 : 0),
          unknownSite: p.unknownSite + (audit?.website_status === 'unknown' ? 1 : 0),
          noSite: p.noSite + (audit && primaryHook(audit) === 'no_site' ? 1 : 0),
          noBooking: p.noBooking + (audit && primaryHook(audit) === 'no_booking' ? 1 : 0),
          slowCallbacks: p.slowCallbacks + (audit?.slow_callback_reviews?.length ? 1 : 0),
        }
      )
      return true
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Check failed'
      setProgress((p) => p && { ...p, done: p.done + 1, failed: p.failed + 1, lastError: message })
      // The daily limit applies to every remaining lead
      return !/daily limit/i.test(message)
    }
  }

  const handleStart = async () => {
    const queue = [...leads]
    stopRef.current = false
    setRunning(true)
    setProgress({ ...EMPTY_PROGRESS, total: queue.length })

    const worker = async () => {
      while (queue.length > 0 && !stopRef.current) {
        const lead = queue.shift()!
        if (!(await checkLead(lead))) stopRef.current = true
      }
    }
    await Promise.all(Array.from({ length: CONCURRENCY }, worker))

    setRunning(false)
    queryClient.invalidateQueries({ queryKey: ['leads'] })
    queryClient.invalidateQueries({ queryKey: ['outreach'] })
    queryClient.invalidateQueries({ queryKey: ['calls'] })
  }

  const percent = progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <ScanSearch className="mr-2 h-4 w-4" />
          Check sites
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md" onInteractOutside={(e) => running && e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Check sites</DialogTitle>
          <DialogDescription>
            Reads each lead&apos;s website for an email, the owner&apos;s name and a
            way to book, and runs a mobile speed test. Results feed the score
            and the call brief.
          </DialogDescription>
        </DialogHeader>

        {!progress && (
          <div className="space-y-4">
            {toCheck.isLoading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Finding leads to check...
              </div>
            )}
            {toCheck.error && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {toCheck.error.message}
              </div>
            )}
            {toCheck.data && (
              <>
                <p className="text-sm">
                  {leads.length === 0
                    ? `Every lead in ${toCheck.data.stage.name} was checked in the last ${toCheck.data.settings.audit_max_age_days} days.`
                    : `${leads.length} lead${leads.length === 1 ? '' : 's'} in ${toCheck.data.stage.name} to check. About 20–60 seconds each, ${CONCURRENCY} at a time.`}
                </p>
                {missingWebsite > 0 && (
                  <label className="flex items-start gap-2 text-sm">
                    <Checkbox
                      className="mt-0.5"
                      checked={lookupListing}
                      onCheckedChange={(checked) => setLookupListing(checked === true)}
                    />
                    <span>
                      Look up missing websites on Google ({missingWebsite} lead
                      {missingWebsite === 1 ? '' : 's'} with no website on file)
                      <span className="block text-xs text-muted-foreground">
                        One Google search per lead; the first 1,000 a month are free,
                        then about $35 per 1,000. Without it, these leads are marked
                        &quot;website unknown&quot; and get no no-website points.
                      </span>
                    </span>
                  </label>
                )}
                {placesLeads > 0 && (
                  <label className="flex items-start gap-2 text-sm">
                    <Checkbox
                      className="mt-0.5"
                      checked={checkReviews}
                      onCheckedChange={(checked) => setCheckReviews(checked === true)}
                    />
                    <span>
                      Also scan Google reviews for slow callbacks ({placesLeads} lead
                      {placesLeads === 1 ? '' : 's'})
                      <span className="block text-xs text-muted-foreground">
                        One extra Google request per lead, at a higher price tier.
                      </span>
                    </span>
                  </label>
                )}
              </>
            )}
          </div>
        )}

        {progress && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              {running ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4 text-green-600" />
              )}
              {progress.done} of {progress.total} checked
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div className="h-full bg-primary transition-all" style={{ width: `${percent}%` }} />
            </div>
            <ul className="space-y-1 text-sm text-muted-foreground">
              <li>{progress.emailsFound} new emails found on websites</li>
              {lookupListing && missingWebsite > 0 && (
                <li>{progress.foundOnGoogle} websites found on Google listings</li>
              )}
              <li>{progress.noSite} with no real website (confirmed)</li>
              {progress.unknownSite > 0 && <li>{progress.unknownSite} with website unknown</li>}
              <li>{progress.noBooking} with no way to book or request a quote</li>
              {checkReviews && <li>{progress.slowCallbacks} with reviews about slow callbacks</li>}
              {progress.failed > 0 && <li className="text-destructive">{progress.failed} failed</li>}
            </ul>
            {progress.lastError && (
              <p className="text-xs text-destructive">Last error: {progress.lastError}</p>
            )}
          </div>
        )}

        <DialogFooter>
          {!progress && (
            <>
              <Button variant="outline" onClick={() => handleOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={handleStart} disabled={leads.length === 0}>
                Check {leads.length} site{leads.length === 1 ? '' : 's'}
              </Button>
            </>
          )}
          {progress && running && (
            <Button variant="outline" onClick={() => (stopRef.current = true)}>
              Stop after current
            </Button>
          )}
          {progress && !running && <Button onClick={() => handleOpenChange(false)}>Done</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
