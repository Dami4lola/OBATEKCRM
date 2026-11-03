'use client'

import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { CheckCircle2, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useSourceLeads } from '@/lib/queries/outreach'
import { AGENCY_METROS, AGENCY_SEARCHES } from '@/lib/outreach/agency'

const RESULT_OPTIONS = [20, 40, 60]

interface Totals {
  done: number
  total: number
  found: number
  added: number
  duplicates: number
  overCap: number
}

function toggle(set: Set<string>, value: string, on: boolean): Set<string> {
  const next = new Set(set)
  if (on) next.add(value)
  else next.delete(value)
  return next
}

// Many Google Maps searches in a row: each agency type in each city of the
// ticked states (OUTREACH_PLAN.md §3). Duplicates across searches are skipped
// by the same dedupe as a single search.
export function AgencyBatchSearch({ dailyCap, onDone }: { dailyCap: number; onDone: () => void }) {
  const [searches, setSearches] = useState(() => new Set(AGENCY_SEARCHES))
  const [states, setStates] = useState(() => new Set(AGENCY_METROS.map((m) => m.state)))
  const [maxResults, setMaxResults] = useState(20)
  const [totals, setTotals] = useState<Totals | null>(null)
  const [running, setRunning] = useState(false)
  const stopRef = useRef(false)
  const sourceLeads = useSourceLeads()

  const jobs = AGENCY_METROS.filter((m) => states.has(m.state)).flatMap((metro) =>
    metro.cities.flatMap((city) =>
      AGENCY_SEARCHES.filter((q) => searches.has(q)).map((query) => ({ query, city, state: metro.state }))
    )
  )

  const run = async () => {
    stopRef.current = false
    setRunning(true)
    const sum: Totals = { done: 0, total: jobs.length, found: 0, added: 0, duplicates: 0, overCap: 0 }
    setTotals({ ...sum })

    for (const job of jobs) {
      if (stopRef.current) break
      try {
        const result = await sourceLeads.mutateAsync({
          query: job.query,
          vertical: 'agency',
          city: job.city,
          region: job.state,
          country: 'US',
          maxResults,
        })
        sum.found += result.found
        sum.added += result.added
        sum.duplicates += result.duplicates
        sum.overCap += result.overCap
        sum.done++
        setTotals({ ...sum })
        // The daily limit is used up: later searches would add nothing
        if (result.overCap > 0) break
      } catch (error) {
        // Daily limit, missing key or Google refusing: the rest would fail too
        toast.error(error instanceof Error ? error.message : 'Search failed')
        break
      }
    }
    setRunning(false)
  }

  if (totals && !running) {
    const stoppedEarly = totals.done < totals.total
    return (
      <div className="space-y-3 py-2">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-6 w-6 text-green-600" />
          <p className="font-medium">
            {totals.added} new agenc{totals.added === 1 ? 'y' : 'ies'} added to New
          </p>
        </div>
        <ul className="space-y-1 text-sm text-muted-foreground">
          <li>
            {totals.done} of {totals.total} searches run, {totals.found} businesses looked at
          </li>
          {totals.duplicates > 0 && <li>{totals.duplicates} already in the CRM or found by an earlier search</li>}
          {totals.overCap > 0 && <li>{totals.overCap} skipped: daily limit of {dailyCap} new leads reached. Run it again tomorrow.</li>}
          {stoppedEarly && totals.overCap === 0 && <li>Stopped before the last searches</li>}
        </ul>
        <p className="text-xs text-muted-foreground">
          Next: <strong>Check sites</strong> finds emails, services, GoHighLevel and team size, and flags branding,
          social-content and enterprise agencies so they score below zero.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setTotals(null)}>
            Search again
          </Button>
          <Button onClick={onDone}>Done</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Agency types</Label>
        <div className="grid grid-cols-2 gap-2">
          {AGENCY_SEARCHES.map((query) => (
            <label key={query} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={searches.has(query)}
                onCheckedChange={(v) => setSearches((s) => toggle(s, query, v === true))}
                disabled={running}
              />
              {query}
            </label>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          GoHighLevel shops rarely show as such on Google Maps; the site check spots them.
        </p>
      </div>

      <div className="space-y-2">
        <Label>States</Label>
        <div className="grid grid-cols-2 gap-2">
          {AGENCY_METROS.map((metro) => (
            <label key={metro.state} className="flex items-start gap-2 text-sm">
              <Checkbox
                className="mt-0.5"
                checked={states.has(metro.state)}
                onCheckedChange={(v) => setStates((s) => toggle(s, metro.state, v === true))}
                disabled={running}
              />
              <span>
                {metro.name}
                <span className="block text-xs text-muted-foreground">{metro.cities.join(', ')}</span>
              </span>
            </label>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Label>Per search</Label>
        <Select value={String(maxResults)} onValueChange={(v) => setMaxResults(Number(v))} disabled={running}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {RESULT_OPTIONS.map((n) => (
              <SelectItem key={n} value={String(n)}>
                Up to {n} businesses
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          {jobs.length} searches, up to {jobs.length * maxResults} businesses looked at (many overlap). New leads are
          capped at {dailyCap} a day (places_daily_lead_cap); for 300+ in one go, raise it first or run this on two days.
          Each search costs Google API credit.
        </p>
      </div>

      <div className="flex items-center justify-end gap-2">
        {running && totals && (
          <span className="mr-auto flex items-center gap-2 text-sm">
            <Loader2 className="h-4 w-4 animate-spin" />
            Search {Math.min(totals.done + 1, totals.total)} of {totals.total} · {totals.added} added
          </span>
        )}
        {running ? (
          <Button variant="ghost" onClick={() => (stopRef.current = true)}>
            Stop
          </Button>
        ) : (
          <Button onClick={run} disabled={jobs.length === 0}>
            Run {jobs.length} searches
          </Button>
        )}
      </div>
    </div>
  )
}
