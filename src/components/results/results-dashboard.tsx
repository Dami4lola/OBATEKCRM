'use client'

import { useMemo, useState } from 'react'
import { endOfDay, startOfDay, subDays } from 'date-fns'
import { Loader2 } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { buildResults, type Results, type ResultsRange } from '@/lib/outreach/results'
import { useResultsData } from '@/lib/queries/results'
import { DateRangePicker } from './date-range-picker'
import { BarList, BreakdownTable, percent, StatTile } from './result-parts'

const DEFAULT_DAYS = 30

function lastDays(days: number): ResultsRange {
  const now = new Date()
  return { from: startOfDay(subDays(now, days - 1)), to: endOfDay(now) }
}

function per100Text(value: number | null): string {
  return value === null ? '–' : value.toFixed(1)
}

function EmailTiles({ results }: { results: Results }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatTile label="Leads emailed" value={String(results.emailed)} detail="First email sent in these dates" />
      <StatTile
        label="Reply rate"
        value={percent(results.replyRate)}
        detail={`${results.replied} ${results.replied === 1 ? 'reply' : 'replies'}, not counting out of office`}
      />
      <StatTile label="Bounce rate" value={percent(results.bounceRate)} detail={`${results.bounced} bounced`} />
      <StatTile label="Unsubscribes" value={String(results.unsubscribed)} detail="Added to do-not-contact" />
    </div>
  )
}

function MeetingsCard({ results }: { results: Results }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Meetings per 100 contacted</CardTitle>
        <CardDescription>
          Leads first contacted in these dates, by how they were reached first
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="text-5xl font-semibold tabular-nums">{per100Text(results.per100)}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {results.meetings} {results.meetings === 1 ? 'meeting' : 'meetings'} from {results.contacted} contacted
          </p>
        </div>
        <div className="divide-y rounded-md border text-sm">
          {results.channels.map((row) => (
            <div key={row.key} className="flex items-center justify-between gap-4 px-3 py-2">
              <span className="font-medium">{row.label}</span>
              <span className="text-muted-foreground tabular-nums">
                {row.meetings} from {row.contacted} · {per100Text(row.per100)} per 100
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

function ResultsBody({ results }: { results: Results }) {
  if (results.emailed === 0 && results.contacted === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Nothing was sent in these dates.
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <EmailTiles results={results} />

      <div className="grid gap-6 xl:grid-cols-3">
        <MeetingsCard results={results} />
        <Card>
          <CardHeader>
            <CardTitle>Replies by label</CardTitle>
            <CardDescription>What people said, for emails sent in these dates</CardDescription>
          </CardHeader>
          <CardContent>
            <BarList rows={results.replyLabels} emptyText="No replies to these emails yet." />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Inbox placement</CardTitle>
            <CardDescription>Where seed copies landed</CardDescription>
          </CardHeader>
          <CardContent>
            <BarList rows={results.placement} emptyText="No seed copies went out in these dates." />
          </CardContent>
        </Card>
      </div>

      {results.emailed > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>What worked best</CardTitle>
            <CardDescription>Highest reply rate first. Small groups can swing a lot, so check the counts.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-6 xl:grid-cols-2">
            <BreakdownTable heading="Industry" rows={results.byIndustry} />
            <BreakdownTable heading="What the email led with" rows={results.byHook} />
          </CardContent>
        </Card>
      )}
    </div>
  )
}

export function ResultsDashboard() {
  const [range, setRange] = useState(() => lastDays(DEFAULT_DAYS))
  const { data, isLoading, error } = useResultsData()
  const results = useMemo(() => (data ? buildResults(data, range) : null), [data, range])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Results</h1>
        <p className="text-muted-foreground">How your outreach is doing, by the date leads were first contacted</p>
      </div>

      <DateRangePicker range={range} onChange={setRange} />

      {isLoading && (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading results...
        </div>
      )}
      {error && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error instanceof Error ? error.message : 'Failed to load results'}
        </div>
      )}
      {results && <ResultsBody results={results} />}
    </div>
  )
}
