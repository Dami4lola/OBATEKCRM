'use client'

import { AlertCircle, Info } from 'lucide-react'
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

export function GatherStep({
  rows,
  settings,
  stageName,
  selectedIds,
  onToggle,
  onToggleAll,
}: GatherStepProps) {
  const selectableCount = rows.filter((row) => !row.blocked).length
  const blockedCount = rows.length - selectableCount
  const allSelected = selectableCount > 0 && selectedIds.size === selectableCount

  if (rows.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground">
        No leads in the {stageName} stage right now. You can still schedule a
        run; it will pick up whatever is in {stageName} when it fires.
      </div>
    )
  }

  return (
    <div className="space-y-3">
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
            disabled={selectableCount === 0}
            onCheckedChange={(checked) => onToggleAll(checked === true)}
          />
          {selectedIds.size} of {selectableCount} selected
        </label>
        {blockedCount > 0 && (
          <span className="text-muted-foreground">
            {blockedCount} can&apos;t be emailed
          </span>
        )}
      </div>

      {selectedIds.size > settings.daily_send_cap && (
        <p className="text-xs text-muted-foreground">
          The daily send cap is {settings.daily_send_cap}. Leads over the cap
          stay in {stageName} for the next run.
        </p>
      )}

      <div className="max-h-80 overflow-y-auto rounded-md border divide-y">
        {rows.map(({ lead, warnings, blocked, score }) => {
          const details = [lead.city, lead.vertical].filter(Boolean).join(' · ')

          return (
            <label
              key={lead.id}
              className={`flex gap-3 p-3 ${
                blocked ? 'bg-muted/40 cursor-not-allowed' : 'cursor-pointer hover:bg-muted/30'
              }`}
            >
              <Checkbox
                className="mt-0.5"
                checked={selectedIds.has(lead.id)}
                disabled={blocked}
                onCheckedChange={(checked) => onToggle(lead.id, checked === true)}
              />
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-sm font-medium">
                    {lead.contact_name}
                    {lead.company_name && (
                      <span className="font-normal text-muted-foreground">
                        {' '}· {lead.company_name}
                      </span>
                    )}
                  </span>
                  <span className="flex flex-shrink-0 items-center gap-2 text-xs text-muted-foreground">
                    {details}
                    <ScoreBadge score={score} threshold={settings.score_threshold} />
                  </span>
                </div>
                {lead.email && (
                  <p className="truncate text-xs text-muted-foreground">{lead.email}</p>
                )}
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
        })}
      </div>
    </div>
  )
}
