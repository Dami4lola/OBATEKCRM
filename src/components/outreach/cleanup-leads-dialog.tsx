'use client'

import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Loader2, Trash2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useCleanupCandidates, useDeleteLowValueLeads } from '@/lib/queries/cleanup'
import { auditFindings, parseAudit } from '@/lib/outreach/audit-findings'
import { describeCompanySize } from '@/lib/outreach/company-size'
import { offeredByGenericRule } from '@/lib/outreach/cleanup'
import type { Lead } from '@/types/database'
import { ScoreBadge } from './score-badge'

function whyLow(lead: Lead): string | null {
  const audit = parseAudit(lead.audit)
  return audit ? auditFindings(audit)[0] ?? null : null
}

export function CleanupLeadsDialog() {
  const [open, setOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)
  // null = the score threshold from settings
  const [cutoff, setCutoff] = useState<number | null>(null)
  const [includeGeneric, setIncludeGeneric] = useState(true)
  // Ticked by default; this holds the ones unticked by hand
  const [unticked, setUnticked] = useState<Set<string>>(new Set())

  const candidates = useCleanupCandidates(open)
  const deleteLeads = useDeleteLowValueLeads()

  const threshold = candidates.data?.settings.score_threshold ?? 5
  const keepScore = candidates.data?.settings.generic_email_keep_score ?? 7
  const smallMax = candidates.data?.settings.small_business_max_staff ?? 50
  const maxScore = cutoff ?? threshold
  const belowCutoff = useMemo(
    () =>
      (candidates.data?.rows ?? []).filter(
        (row) =>
          row.score.score < maxScore ||
          (includeGeneric &&
            offeredByGenericRule({
              genericOnly: row.genericOnly,
              size: row.size,
              score: row.score.score,
              keepScore,
            }))
      ),
    [candidates.data, maxScore, includeGeneric, keepScore]
  )
  const eligible = belowCutoff.filter((row) => !row.hasHistory)
  const keptCount = belowCutoff.length - eligible.length
  const selected = eligible.filter((row) => !unticked.has(row.lead.id))

  const handleOpenChange = (nextOpen: boolean) => {
    if (deleteLeads.isPending) return
    if (!nextOpen) {
      setCutoff(null)
      setIncludeGeneric(true)
      setUnticked(new Set())
    }
    setOpen(nextOpen)
  }

  const handleToggle = (leadId: string) => {
    setUnticked((prev) => {
      const next = new Set(prev)
      if (next.has(leadId)) next.delete(leadId)
      else next.add(leadId)
      return next
    })
  }

  const handleDelete = async () => {
    try {
      const count = await deleteLeads.mutateAsync(selected)
      toast.success(`Deleted ${count} lead${count === 1 ? '' : 's'}`)
      setConfirming(false)
      handleOpenChange(false)
    } catch (error) {
      setConfirming(false)
      toast.error(error instanceof Error ? error.message : 'Failed to delete leads', {
        duration: 10_000,
      })
    }
  }

  const stageName = candidates.data?.stage.name ?? 'New'

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogTrigger asChild>
          <Button variant="outline">
            <Trash2 className="mr-2 h-4 w-4" />
            Clean up
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Clean up low-value leads</DialogTitle>
            <DialogDescription>
              Deletes leads in {stageName} that scored low after their site check.
              Deleted businesses are remembered, so Find leads won&apos;t add them again.
            </DialogDescription>
          </DialogHeader>

          {candidates.isLoading && (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Scoring leads...
            </div>
          )}
          {candidates.error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {candidates.error.message}
            </div>
          )}

          {candidates.data && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span>Score below</span>
                <Select
                  value={String(maxScore)}
                  onValueChange={(value) => {
                    setCutoff(Number(value))
                    setUnticked(new Set())
                  }}
                >
                  <SelectTrigger className="w-20">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: threshold }, (_, i) => i + 1).map((n) => (
                      <SelectItem key={n} value={String(n)}>
                        {n}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span className="text-muted-foreground">
                  (outreach threshold is {threshold})
                </span>
              </div>

              <label className="flex items-start gap-2 text-sm">
                <Checkbox
                  className="mt-0.5"
                  checked={includeGeneric}
                  onCheckedChange={(checked) => {
                    setIncludeGeneric(checked === true)
                    setUnticked(new Set())
                  }}
                />
                <span>
                  Also remove larger companies whose only email is a shared inbox (info@,
                  office@, contact@…), unless they score {keepScore} or more
                  <span className="block text-xs text-muted-foreground">
                    Companies with {smallMax} or fewer staff are kept: info@ usually reaches
                    the owner there. Size comes from staff size, the website or Google
                    reviews; unknown counts as small.
                  </span>
                </span>
              </label>

              <ul className="space-y-0.5 text-xs text-muted-foreground">
                {keptCount > 0 && (
                  <li>
                    {keptCount} low-scoring lead{keptCount === 1 ? '' : 's'} kept: they have
                    calls, meetings, emails or open tasks, which would be deleted too.
                  </li>
                )}
                {candidates.data.uncheckedCount > 0 && (
                  <li>
                    {candidates.data.uncheckedCount} lead
                    {candidates.data.uncheckedCount === 1 ? '' : 's'} not checked yet, so not
                    included. Run Check sites first.
                  </li>
                )}
              </ul>

              {eligible.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No leads to clean up at this cutoff.
                </p>
              ) : (
                <>
                  <label className="flex items-center gap-2 text-sm font-medium">
                    <Checkbox
                      checked={selected.length === eligible.length}
                      onCheckedChange={(checked) =>
                        setUnticked(
                          checked === true ? new Set() : new Set(eligible.map((r) => r.lead.id))
                        )
                      }
                    />
                    {selected.length} of {eligible.length} selected
                  </label>
                  <div className="max-h-80 divide-y overflow-y-auto rounded-md border">
                    {eligible.map(({ lead, score, genericOnly, size }) => {
                      const reason =
                        score.score >= maxScore && genericOnly
                          ? `Only a generic email (${lead.email ?? 'from site'}) · ${describeCompanySize(size, smallMax)}`
                          : whyLow(lead)
                      return (
                        <label
                          key={lead.id}
                          className="flex cursor-pointer items-center gap-3 p-3 hover:bg-muted/30"
                        >
                          <Checkbox
                            checked={!unticked.has(lead.id)}
                            onCheckedChange={() => handleToggle(lead.id)}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">
                              {lead.company_name || lead.contact_name}
                            </p>
                            <p className="truncate text-xs text-muted-foreground">
                              {[lead.city, lead.vertical, reason].filter(Boolean).join(' · ')}
                            </p>
                          </div>
                          <ScoreBadge score={score} threshold={threshold} />
                        </label>
                      )
                    })}
                  </div>
                </>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => handleOpenChange(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => setConfirming(true)}
              disabled={selected.length === 0 || deleteLeads.isPending}
            >
              Delete {selected.length} lead{selected.length === 1 ? '' : 's'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirming} onOpenChange={(next) => !deleteLeads.isPending && setConfirming(next)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {selected.length} lead{selected.length === 1 ? '' : 's'}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This can&apos;t be undone. Their notes and site checks are deleted too.
              Find leads won&apos;t add these businesses again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteLeads.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                // Keep the dialog open until the delete finishes
                e.preventDefault()
                handleDelete()
              }}
              disabled={deleteLeads.isPending}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {deleteLeads.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
