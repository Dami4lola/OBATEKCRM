'use client'

import { useState } from 'react'
import { AlertCircle, ChevronDown, ChevronRight, Info } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import type { GatherRow } from '@/lib/queries/outreach'
import type { OutreachSettings } from '@/lib/outreach/settings'
import { ScoreBadge } from './score-badge'

interface GatherStepProps {
  rows: GatherRow[]
  settings: OutreachSettings
  stageName: string
  selectedIds: Set<string>
  onToggle: (leadId: string, checked: boolean) => void
  onToggleAll: (checked: boolean) => void
}

interface LeadRowProps {
  row: GatherRow
  threshold: number
  selected: boolean
  onToggle: (leadId: string, checked: boolean) => void
}

function LeadRow({ row: { lead, warnings, blocked, score }, threshold, selected, onToggle }: LeadRowProps) {
  const details = [lead.city, lead.vertical].filter(Boolean).join(' · ')

  return (
    <label
      className={`flex gap-3 px-3 py-1.5 ${
        blocked ? 'bg-muted/40 cursor-not-allowed' : 'cursor-pointer hover:bg-muted/30'
      }`}
    >
      <Checkbox
        className="mt-0.5"
        checked={selected}
        disabled={blocked}
        onCheckedChange={(checked) => onToggle(lead.id, checked === true)}
      />
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-baseline justify-between gap-3">
          <span className="min-w-0 flex-1 truncate text-sm font-medium">
            {lead.contact_name}
            {lead.company_name && (
              <span className="font-normal text-muted-foreground">
                {' '}· {lead.company_name}
              </span>
            )}
          </span>
          {lead.email && (
            <span className="hidden w-52 flex-shrink-0 truncate text-xs text-muted-foreground xl:block">
              {lead.email}
            </span>
          )}
          <span className="flex flex-shrink-0 items-center gap-2 text-xs text-muted-foreground">
            {details}
            <ScoreBadge score={score} threshold={threshold} />
          </span>
        </div>
        {lead.email && <p className="truncate text-xs text-muted-foreground xl:hidden">{lead.email}</p>}
        {warnings.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {warnings.map((warning) => (
              <Badge
                key={warning.code}
                variant={warning.blocking ? 'destructive' : 'outline'}
                className="font-normal"
              >
                {warning.blocking && <AlertCircle />}
                {warning.message}
              </Badge>
            ))}
          </div>
        )}
      </div>
    </label>
  )
}

export function GatherStep({
  rows,
  settings,
  stageName,
  selectedIds,
  onToggle,
  onToggleAll,
}: GatherStepProps) {
  const [showBlocked, setShowBlocked] = useState(false)
  const ready = rows.filter((row) => !row.blocked)
  const blocked = rows.filter((row) => row.blocked)
  const allSelected = ready.length > 0 && selectedIds.size === ready.length
  // Blocked leads can't be ticked, so they stay out of the way until asked for
  const listed = showBlocked || ready.length === 0 ? [...ready, ...blocked] : ready

  if (rows.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground">
        No leads in the {stageName} stage right now. You can still schedule a
        run; it will pick up whatever is in {stageName} when it fires.
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3 lg:min-h-0 lg:flex-1">
      {settings.sending_paused && (
        <div className="flex gap-2 rounded-md bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-300">
          <Info className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <span>
            Sending is paused (warm-up). Runs will prepare emails, but nothing
            is sent until sending is turned on.
          </span>
        </div>
      )}

      <div className="flex items-center justify-between text-sm">
        <label className="flex items-center gap-2 font-medium">
          <Checkbox
            checked={allSelected}
            disabled={ready.length === 0}
            onCheckedChange={(checked) => onToggleAll(checked === true)}
          />
          {selectedIds.size} of {ready.length} selected
        </label>
        {blocked.length > 0 && (
          <button
            type="button"
            className="flex items-center gap-1 text-muted-foreground hover:text-foreground"
            aria-expanded={showBlocked}
            onClick={() => setShowBlocked((shown) => !shown)}
          >
            {showBlocked ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            {blocked.length} can&apos;t be emailed
          </button>
        )}
      </div>

      {selectedIds.size > settings.daily_send_cap && (
        <p className="text-xs text-muted-foreground">
          The daily send cap is {settings.daily_send_cap}. Leads over the cap
          stay in {stageName} for the next run.
        </p>
      )}

      <div className="divide-y rounded-md border lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
        {listed.map((row) => (
          <LeadRow
            key={row.lead.id}
            row={row}
            threshold={settings.score_threshold}
            selected={selectedIds.has(row.lead.id)}
            onToggle={onToggle}
          />
        ))}
      </div>
    </div>
  )
}
