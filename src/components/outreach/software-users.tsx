'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { CheckCircle2, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useOutreachSettings, useSoftwareSearch } from '@/lib/queries/outreach'
import { US_TARGET_METROS } from '@/lib/outreach/us-targets'
import type { SoftwareSearchResult } from '@/lib/outreach/tech-leads'

const LIMIT_OPTIONS = [10, 25, 50]
const CREDITS_PER_COMPANY = 3

function toggle(set: Set<string>, value: string, on: boolean): Set<string> {
  const next = new Set(set)
  if (on) next.add(value)
  else next.delete(value)
  return next
}

// Find leads → Software users (OUTREACH_PLAN.md §3): small companies whose
// job posts show GoHighLevel, AppFolio, Buildium and the like. They come
// with a website, size and LinkedIn page, and the email can say what they
// already run.
export function SoftwareUsers({ onDone }: { onDone: () => void }) {
  const { data: settings } = useOutreachSettings()
  const targets = settings?.tech_targets ?? []
  const [slugs, setSlugs] = useState<Set<string> | null>(null)
  const [states, setStates] = useState(() => new Set(US_TARGET_METROS.map((m) => m.state)))
  const [limit, setLimit] = useState(10)
  const [result, setResult] = useState<SoftwareSearchResult | null>(null)
  const search = useSoftwareSearch()
  // Property management tools ticked until changed
  const picked = slugs ?? new Set(targets.filter((t) => t.vertical === 'property').map((t) => t.slug))

  const handleSearch = async () => {
    try {
      setResult(await search.mutateAsync({ slugs: [...picked], states: [...states], limit }))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to search for software users')
    }
  }

  if (result) {
    return (
      <div className="space-y-3 py-2">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-6 w-6 text-green-600" />
          <p className="font-medium">
            {result.added} new lead{result.added === 1 ? '' : 's'} added to {result.stageName}
          </p>
        </div>
        <ul className="space-y-1 text-sm text-muted-foreground">
          <li>
            {result.returned} companies returned ({result.returned * CREDITS_PER_COMPANY} TheirStack credits)
          </li>
          {result.matched > 0 && <li>{result.matched} already in the CRM: tagged with the software they use</li>}
          {result.skipped > 0 && (
            <li>
              {result.skipped} skipped and remembered, so they aren&apos;t paid for again
              {result.skipReasons.length > 0 && (
                <ul className="ml-4 list-disc text-xs">
                  {result.skipReasons.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
              )}
            </li>
          )}
        </ul>
        <p className="text-xs text-muted-foreground">
          Next: <strong>Check sites</strong> finds emails and the owner.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setResult(null)}>
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
        <Label>Uses</Label>
        <div className="grid grid-cols-2 gap-2">
          {targets.map((target) => (
            <label key={target.slug} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={picked.has(target.slug)}
                onCheckedChange={(v) => setSlugs(toggle(picked, target.slug, v === true))}
                disabled={search.isPending}
              />
              {target.label}
              <span className="text-xs text-muted-foreground">{target.vertical === 'agency' ? 'agencies' : 'property'}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Label>States</Label>
        <div className="grid grid-cols-2 gap-2">
          {US_TARGET_METROS.map((metro) => (
            <label key={metro.state} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={states.has(metro.state)}
                onCheckedChange={(v) => setStates((s) => toggle(s, metro.state, v === true))}
                disabled={search.isPending}
              />
              {metro.name}
            </label>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Label>How many</Label>
        <Select value={String(limit)} onValueChange={(v) => setLimit(Number(v))} disabled={search.isPending}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LIMIT_OPTIONS.map((n) => (
              <SelectItem key={n} value={String(n)}>
                Up to {n} companies ({n * CREDITS_PER_COMPANY} credits)
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          3 TheirStack credits per company returned, 2–20 staff, in the target cities. TheirStack matches city names
          loosely (Charlotte also finds Charlottesville), so a few may be outside your area: they&apos;re skipped and
          never bought again. Up to {settings?.tech_daily_companies ?? 50} companies a day (tech_daily_companies).
        </p>
      </div>

      <div className="flex justify-end">
        <Button onClick={handleSearch} disabled={search.isPending || picked.size === 0 || states.size === 0}>
          {search.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Find up to {limit} companies
        </Button>
      </div>
    </div>
  )
}
