'use client'

import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Loader2, Phone, PhoneCall } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { MeetingFormDialog } from '@/components/meetings/meeting-form-dialog'
import {
  useAddCallTasks,
  useCallList,
  useLogCall,
  type CallTask,
} from '@/lib/queries/calls'
import { CALL_OUTCOMES, type CallOutcome } from '@/lib/outreach/call-brief'
import type { Lead } from '@/types/database'
import { ScoreBadge } from './score-badge'

function CallTaskCard({
  call,
  onMeetingBooked,
}: {
  call: CallTask
  onMeetingBooked: (lead: Lead) => void
}) {
  const [outcome, setOutcome] = useState<CallOutcome | ''>('')
  const [notes, setNotes] = useState('')
  const logCall = useLogCall()

  const handleLog = async () => {
    if (!outcome) return
    try {
      await logCall.mutateAsync({ task: call.task, outcome, notes })
      toast.success('Call logged')
      if (outcome === 'meeting_booked') onMeetingBooked(call.lead)
    } catch (error) {
      toast.error('Failed to log the call')
      console.error('Log call error:', error)
    }
  }

  return (
    <div className="space-y-3 rounded-md border p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium">{call.task.title}</p>
        {call.lead.phone && (
          <a
            href={`tel:${call.lead.phone}`}
            className="flex flex-shrink-0 items-center gap-1 text-sm text-primary hover:underline"
          >
            <Phone className="h-3.5 w-3.5" />
            {call.lead.phone}
          </a>
        )}
      </div>
      {call.task.description && (
        <p className="whitespace-pre-line rounded bg-muted/50 p-2 text-xs leading-relaxed">
          {call.task.description}
        </p>
      )}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Select value={outcome} onValueChange={(value) => setOutcome(value as CallOutcome)}>
          <SelectTrigger className="sm:w-44">
            <SelectValue placeholder="Outcome" />
          </SelectTrigger>
          <SelectContent>
            {CALL_OUTCOMES.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notes (optional)"
          rows={1}
          className="min-h-9 flex-1"
        />
        <Button onClick={handleLog} disabled={!outcome || logCall.isPending}>
          {logCall.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Log call
        </Button>
      </div>
    </div>
  )
}

export function TodaysCallsDialog() {
  const [open, setOpen] = useState(false)
  // Candidates ticked or unticked by hand, away from the default (top N)
  const [toggledIds, setToggledIds] = useState<Set<string>>(new Set())
  const [meetingLead, setMeetingLead] = useState<Lead | null>(null)

  const callList = useCallList(open)
  const addCalls = useAddCallTasks()

  const candidates = useMemo(() => callList.data?.candidates ?? [], [callList.data])
  const defaultCount = callList.data?.settings.call_list_size ?? 3
  const selected = useMemo(
    () =>
      candidates.filter(
        (candidate, index) => (index < defaultCount) !== toggledIds.has(candidate.lead.id)
      ),
    [candidates, defaultCount, toggledIds]
  )

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) setToggledIds(new Set())
    setOpen(nextOpen)
  }

  const handleToggle = (leadId: string) => {
    setToggledIds((prev) => {
      const next = new Set(prev)
      if (next.has(leadId)) next.delete(leadId)
      else next.add(leadId)
      return next
    })
  }

  const handleAdd = async () => {
    try {
      await addCalls.mutateAsync(selected)
      setToggledIds(new Set())
      toast.success(`${selected.length} call${selected.length === 1 ? '' : 's'} added for today`)
    } catch (error) {
      toast.error('Failed to add calls')
      console.error('Add calls error:', error)
    }
  }

  const today = callList.data?.today ?? []
  const threshold = callList.data?.settings.score_threshold ?? 0

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogTrigger asChild>
          <Button variant="outline">
            <PhoneCall className="mr-2 h-4 w-4" />
            Today&apos;s calls
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Today&apos;s calls</DialogTitle>
            <DialogDescription>
              Each call has a brief: who to ask for, their pain, and one question.
              Logging the outcome adds it to the lead&apos;s timeline.
            </DialogDescription>
          </DialogHeader>

          {callList.isLoading && (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading calls...
            </div>
          )}
          {callList.error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {callList.error.message}
            </div>
          )}

          {callList.data && (
            <div className="space-y-6">
              <section className="space-y-2">
                <h3 className="text-sm font-medium">To call ({today.length})</h3>
                {today.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Nothing on today&apos;s list. Add some below.
                  </p>
                ) : (
                  today.map((call) => (
                    <CallTaskCard
                      key={call.task.id}
                      call={call}
                      onMeetingBooked={setMeetingLead}
                    />
                  ))
                )}
              </section>

              <section className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-medium">Best leads to call next</h3>
                  <Button
                    size="sm"
                    onClick={handleAdd}
                    disabled={selected.length === 0 || addCalls.isPending}
                  >
                    {addCalls.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Add {selected.length} to today
                  </Button>
                </div>
                {candidates.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No leads with a phone number left in New or Contacted.
                  </p>
                ) : (
                  <div className="divide-y rounded-md border">
                    {candidates.map(({ lead, score }) => {
                      const checked = selected.some((c) => c.lead.id === lead.id)
                      return (
                        <label
                          key={lead.id}
                          className="flex cursor-pointer items-center gap-3 p-3 hover:bg-muted/30"
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={() => handleToggle(lead.id)}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">
                              {lead.company_name || lead.contact_name}
                            </p>
                            <p className="truncate text-xs text-muted-foreground">
                              {[lead.city, lead.vertical, lead.phone].filter(Boolean).join(' · ')}
                            </p>
                          </div>
                          <ScoreBadge score={score} threshold={threshold} />
                        </label>
                      )
                    })}
                  </div>
                )}
              </section>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <MeetingFormDialog
        open={!!meetingLead}
        onOpenChange={(nextOpen) => !nextOpen && setMeetingLead(null)}
        lead={meetingLead}
      />
    </>
  )
}
