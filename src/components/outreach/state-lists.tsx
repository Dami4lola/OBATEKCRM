'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { CheckCircle2, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useImportLicenses, useOutreachSettings } from '@/lib/queries/outreach'
import type { LicenseImportResult, LicenseState } from '@/lib/outreach/license-lists'

const LIMIT_OPTIONS = [50, 100, 200]

const STATES: { code: string; name: string; live: boolean; about: string }[] = [
  {
    code: 'TX',
    name: 'Texas',
    live: true,
    about: 'TREC: every licensed brokerage, its designated broker and how many agents it has.',
  },
  { code: 'NY', name: 'New York', live: true, about: 'Department of State: each office, its broker and its agents.' },
  { code: 'IL', name: 'Illinois', live: true, about: 'IDFPR: licensed firms with city and licence date (no broker name or size).' },
  { code: 'FL', name: 'Florida', live: false, about: 'DBPR blocks automated downloads: upload a county file (coming once a sample is in).' },
  { code: 'GA', name: 'Georgia', live: false, about: 'Roster by paid request to the Secretary of State.' },
  { code: 'NC', name: 'North Carolina', live: false, about: 'No bulk download: request the firm list from the Commission.' },
  { code: 'SC', name: 'South Carolina', live: false, about: 'No bulk download: request the list from LLR.' },
]

// Find leads → State lists (OUTREACH_PLAN.md §3): licensed brokerages and
// property managers from official state data, with the broker's name and
// office size where the state publishes them
export function StateLists({ onDone }: { onDone: () => void }) {
  const { data: settings } = useOutreachSettings()
  const [state, setState] = useState<LicenseState>('TX')
  const [picked, setPicked] = useState<Record<string, Set<string>>>({})
  const [limit, setLimit] = useState(50)
  const [newFirst, setNewFirst] = useState(true)
  const [result, setResult] = useState<LicenseImportResult | null>(null)
  const importLicenses = useImportLicenses()

  const info = STATES.find((s) => s.code === state)
  const allCounties = settings?.license_counties[state] ?? []
  // All counties ticked until changed
  const counties = picked[state] ?? new Set(allCounties)

  const toggleCounty = (county: string, on: boolean) => {
    const next = new Set(counties)
    if (on) next.add(county)
    else next.delete(county)
    setPicked((p) => ({ ...p, [state]: next }))
  }

  const handleImport = async () => {
    try {
      setResult(await importLicenses.mutateAsync({ state, counties: [...counties], limit, newFirst }))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to import the licence list')
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
          <li>{result.found} brokerages fit (2–20 people, or property managers)</li>
          {result.already > 0 && <li>{result.already} already in the CRM</li>}
          {result.overCap > 0 && <li>{result.overCap} skipped: daily limit reached. Run it again tomorrow.</li>}
        </ul>
        <p className="text-xs text-muted-foreground">
          Next: <strong>Check sites</strong> finds each brokerage&apos;s website from its Google listing, then the email.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setResult(null)}>
            Import more
          </Button>
          <Button onClick={onDone}>Done</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>State</Label>
        <Select value={state} onValueChange={(v) => setState(v as LicenseState)} disabled={importLicenses.isPending}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATES.map((s) => (
              <SelectItem key={s.code} value={s.code} disabled={!s.live}>
                {s.name}
                {!s.live && ' (file needed)'}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {info && <p className="text-xs text-muted-foreground">{info.about}</p>}
      </div>

      <div className="space-y-2">
        <Label>Counties</Label>
        <div className="grid grid-cols-2 gap-2">
          {allCounties.map((county) => (
            <label key={county} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={counties.has(county)}
                onCheckedChange={(v) => toggleCounty(county, v === true)}
                disabled={importLicenses.isPending}
              />
              {county}
            </label>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>How many</Label>
          <Select value={String(limit)} onValueChange={(v) => setLimit(Number(v))} disabled={importLicenses.isPending}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LIMIT_OPTIONS.map((n) => (
                <SelectItem key={n} value={String(n)}>
                  Up to {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {state !== 'NY' && (
          <label className="flex items-end gap-2 pb-2 text-sm">
            <Checkbox checked={newFirst} onCheckedChange={(v) => setNewFirst(v === true)} disabled={importLicenses.isPending} />
            Newly licensed first
          </label>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Official state data, free. Brokerages with 2–20 people are kept, plus property managers (their staff
        usually aren&apos;t licensed, so their size shows as unknown). Up to {settings?.license_daily_lead_cap ?? 200} a
        day (license_daily_lead_cap).
      </p>

      <div className="flex justify-end">
        <Button onClick={handleImport} disabled={importLicenses.isPending || counties.size === 0}>
          {importLicenses.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Import from {info?.name}
        </Button>
      </div>
    </div>
  )
}
