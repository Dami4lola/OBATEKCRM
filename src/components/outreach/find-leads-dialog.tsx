'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { CheckCircle2, Loader2, Search } from 'lucide-react'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { VERTICALS } from '@/lib/validations/lead'
import { useSourceLeads } from '@/lib/queries/outreach'
import type { SourceLeadsResult } from '@/lib/outreach/sourcing'

const RESULT_OPTIONS = [20, 40, 60]

function verticalLabel(vertical: string) {
  return vertical.replace(/_/g, ' ')
}

export function FindLeadsDialog() {
  const [open, setOpen] = useState(false)
  const [vertical, setVertical] = useState('handyman')
  const [query, setQuery] = useState('handyman')
  const [city, setCity] = useState('Ottawa')
  const [region, setRegion] = useState('ON')
  const [country, setCountry] = useState('CA')
  const [maxResults, setMaxResults] = useState(20)
  const [result, setResult] = useState<SourceLeadsResult | null>(null)

  const sourceLeads = useSourceLeads()

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) setResult(null)
    setOpen(nextOpen)
  }

  const handleVerticalChange = (next: string) => {
    // Keep a custom search term; otherwise follow the vertical
    if (query === verticalLabel(vertical)) setQuery(verticalLabel(next))
    setVertical(next)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const data = await sourceLeads.mutateAsync({
        query,
        vertical,
        city,
        region: region || undefined,
        country,
        maxResults,
      })
      setResult(data)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to find leads')
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Search className="mr-2 h-4 w-4" />
          Find leads
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{result ? 'Leads added' : 'Find leads'}</DialogTitle>
          {!result && (
            <DialogDescription>
              Searches Google for local businesses and adds new ones to New.
              Businesses already in the CRM are skipped.
            </DialogDescription>
          )}
        </DialogHeader>

        {result ? (
          <div className="space-y-3 py-2">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-6 w-6 text-green-600" />
              <p className="font-medium">
                {result.added} new lead{result.added === 1 ? '' : 's'} added to{' '}
                {result.stageName}
              </p>
            </div>
            <ul className="space-y-1 text-sm text-muted-foreground">
              <li>{result.found} businesses found</li>
              {result.duplicates > 0 && <li>{result.duplicates} already in the CRM</li>}
              {result.closed > 0 && <li>{result.closed} permanently closed</li>}
              {result.overCap > 0 && (
                <li>{result.overCap} skipped: daily limit for new leads reached</li>
              )}
            </ul>
            <p className="text-xs text-muted-foreground">
              Places doesn&apos;t give emails or staff size. Those come from
              the site check (next build stage), Lusha or the lead sheet.
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setResult(null)}>
                Search again
              </Button>
              <Button onClick={() => handleOpenChange(false)}>Done</Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Vertical</Label>
                <Select value={vertical} onValueChange={handleVerticalChange}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {VERTICALS.map((v) => (
                      <SelectItem key={v} value={v} className="capitalize">
                        {verticalLabel(v)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="find-query">Search for</Label>
                <Input
                  id="find-query"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="e.g. home repair"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-3 space-y-2 sm:col-span-1">
                <Label htmlFor="find-city">City</Label>
                <Input
                  id="find-city"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="find-region">Province / state</Label>
                <Input
                  id="find-region"
                  value={region}
                  onChange={(e) => setRegion(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="find-country">Country</Label>
                <Input
                  id="find-country"
                  value={country}
                  onChange={(e) => setCountry(e.target.value.toUpperCase())}
                  maxLength={2}
                  pattern="[A-Za-z]{2}"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>How many to look at</Label>
              <Select
                value={String(maxResults)}
                onValueChange={(value) => setMaxResults(Number(value))}
              >
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
                Each search costs Google API credit. Google returns at most 60.
              </p>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={sourceLeads.isPending}>
                {sourceLeads.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Find leads
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
