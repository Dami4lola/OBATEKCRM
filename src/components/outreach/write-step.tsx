'use client'

import { useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { Check, ChevronDown, ChevronRight, Loader2, MessageSquare, Sparkles, Undo2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import {
  requestPrepare,
  useReviewEmail,
  useRunEmails,
  type DraftFeedback,
  type RunEmail,
} from '@/lib/queries/write'
import { useOutreachSettings } from '@/lib/queries/outreach'
import { useUpdateLead } from '@/lib/queries/leads'
import { auditFindings, HOOK_LABELS, parseAudit, primaryHook } from '@/lib/outreach/audit-findings'
import { defaultSubject, parseSteps, renderSteps, templateFor, templateVars, wordCount } from '@/lib/outreach/templates'
import type { OutreachSettings } from '@/lib/outreach/settings'
import { REPLY_CLASS_LABELS } from '@/lib/outreach/stats'
import type { OutreachEmail, OutreachEmailStep } from '@/types/database'
import { CopyRulesPanel } from './copy-rules-panel'
import { SendPanel } from './send-panel'
import { SignalDraftExtras } from './linkedin-draft'

const CONCURRENCY = 3
const EMAIL_1_MAX_WORDS = 90

// Where a sent email's sequence is, and what came back from the inbox
function sentStats(email: OutreachEmail): string {
  const parts: string[] = []
  if (email.bounced_at) parts.push('Bounced')
  if (email.unsubscribed_at) parts.push('Unsubscribed')
  if (email.replied_at) {
    parts.push(email.reply_class ? `Replied: ${REPLY_CLASS_LABELS[email.reply_class].toLowerCase()}` : 'Replied')
  }
  if (email.sequence_state === 'active' && email.next_step && email.next_step_at) {
    parts.push(`Email ${email.next_step} due ${format(new Date(email.next_step_at), 'EEE MMM d')}`)
  } else if (email.sequence_state === 'finished') {
    parts.push('All emails sent')
  } else if (email.sequence_state === 'stopped' && !email.replied_at && !email.bounced_at && !email.unsubscribed_at) {
    parts.push(`Stopped: ${email.stopped_reason ?? 'no reason saved'}`)
  }
  return parts.length > 0 ? parts.join(' · ') : 'No reply yet'
}

function templateLabel(key: string) {
  return key === 'default' ? 'Default (trades)' : key.replace(/_/g, ' ')
}

const STATUS_BADGES: Partial<
  Record<OutreachEmail['status'], { label: string; className?: string; variant?: 'outline' | 'destructive' }>
> = {
  approved: { label: 'Approved', className: 'bg-green-600' },
  skipped: { label: 'Skipped', variant: 'outline' },
  queued: { label: 'Queued', className: 'bg-sky-600' },
  sent: { label: 'Sent', className: 'bg-blue-600' },
  failed: { label: 'Failed', variant: 'destructive' },
  blocked: { label: 'Blocked', variant: 'destructive' },
}

function StatusBadge({ status }: { status: OutreachEmail['status'] }) {
  const badge = STATUS_BADGES[status]
  if (!badge) return null
  return (
    <Badge variant={badge.variant} className={badge.className}>
      {badge.label}
    </Badge>
  )
}

interface ReviewedEmailProps {
  email: OutreachEmail
  step: OutreachEmailStep | undefined
  pending: boolean
  onReopen: () => void
}

// An email past the draft stage: what was saved, and what became of it
function ReviewedEmail({ email, step, pending, onReopen }: ReviewedEmailProps) {
  // Sent and blocked are final; the rest can go back to a draft
  const canUndo = ['approved', 'queued', 'skipped', 'failed'].includes(email.status)

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{step?.subject}</p>
      <p className="whitespace-pre-line text-sm text-muted-foreground">{step?.body}</p>
      {email.status === 'sent' && (
        <p className={`text-xs ${email.reply_class === 'interested' ? 'font-medium text-green-700 dark:text-green-400' : 'text-muted-foreground'}`}>
          {sentStats(email)}
        </p>
      )}
      {email.status === 'failed' && email.last_error && (
        <p className="text-xs text-destructive">{email.last_error}</p>
      )}
      {email.status === 'blocked' && email.blocked_reason && (
        <p className="text-xs text-destructive">{email.blocked_reason}</p>
      )}
      {canUndo && (
        <Button variant="ghost" size="sm" className="h-7 px-2" onClick={onReopen} disabled={pending}>
          <Undo2 className="mr-1 h-3 w-3" />
          {email.status === 'failed' ? 'Back to draft' : 'Undo'}
        </Button>
      )}
    </div>
  )
}

interface TemplatePickerProps {
  keys: string[]
  value: string
  disabled: boolean
  onChange: (key: string) => void
}

function TemplatePicker({ keys, value, disabled, onChange }: TemplatePickerProps) {
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      Template
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger className="h-7 w-auto gap-1 text-xs capitalize">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {keys.map((key) => (
            <SelectItem key={key} value={key} className="text-xs capitalize">
              {templateLabel(key)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

interface EmailToolsProps {
  words: number
  editing: boolean
  showFollowUps: boolean
  onEdit: () => void
  onBackToTemplate: () => void
  onToggleFollowUps: () => void
}

// The word count, and the switches under the email
function EmailTools({ words, editing, showFollowUps, onEdit, onBackToTemplate, onToggleFollowUps }: EmailToolsProps) {
  return (
    <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
      <span className={words > EMAIL_1_MAX_WORDS ? 'text-amber-600' : ''}>
        {words} words{words > EMAIL_1_MAX_WORDS && ` (aim for under ${EMAIL_1_MAX_WORDS})`}
      </span>
      {!editing && (
        <button type="button" className="underline" onClick={onEdit}>
          Edit full emails
        </button>
      )}
      {editing && (
        <button type="button" className="underline" onClick={onBackToTemplate}>
          Back to template
        </button>
      )}
      <button type="button" className="flex items-center gap-1 underline" onClick={onToggleFollowUps}>
        {showFollowUps ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        Emails 2–3
      </button>
    </div>
  )
}

interface FollowUpStepsProps {
  steps: OutreachEmailStep[]
  editing: boolean
  onEdit: (index: number, body: string) => void
}

function FollowUpSteps({ steps, editing, onEdit }: FollowUpStepsProps) {
  return (
    <>
      {steps.slice(1).map((step, i) =>
        editing ? (
          <Textarea
            key={step.step}
            value={step.body}
            onChange={(e) => onEdit(i + 1, e.target.value)}
            rows={6}
            className="text-sm"
          />
        ) : (
          <div key={step.step} className="rounded bg-muted/50 p-2 text-sm">
            <p className="mb-1 text-xs text-muted-foreground">
              Email {step.step} · {step.subject}
            </p>
            <p className="whitespace-pre-line">{step.body}</p>
          </div>
        )
      )}
    </>
  )
}

interface DraftActionsProps {
  drafted: boolean
  drafting: boolean
  pending: boolean
  canApprove: boolean
  onDraft: () => void
  onToggleFeedback: () => void
  onApprove: () => void
  onSkip: () => void
}

function DraftActions({ drafted, drafting, pending, canApprove, onDraft, onToggleFeedback, onApprove, onSkip }: DraftActionsProps) {
  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="outline" onClick={onDraft} disabled={drafting || pending}>
        {drafting ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Sparkles className="mr-1 h-3 w-3" />}
        {drafted ? 'Redraft with Claude' : 'Draft with Claude'}
      </Button>
      {drafted && (
        <Button size="sm" variant="outline" onClick={onToggleFeedback} disabled={drafting}>
          <MessageSquare className="mr-1 h-3 w-3" />
          Feedback
        </Button>
      )}
      <Button size="sm" onClick={onApprove} disabled={!canApprove || drafting || pending}>
        <Check className="mr-1 h-3 w-3" />
        Approve
      </Button>
      <Button size="sm" variant="ghost" onClick={onSkip} disabled={drafting || pending}>
        <X className="mr-1 h-3 w-3" />
        Skip
      </Button>
    </div>
  )
}

interface FeedbackFormProps {
  note: string
  remember: boolean
  onlyVertical: boolean
  vertical: string | null
  drafting: boolean
  onNote: (note: string) => void
  onRemember: (on: boolean) => void
  onOnlyVertical: (on: boolean) => void
  onSubmit: () => void
  onCancel: () => void
}

function FeedbackForm({
  note,
  remember,
  onlyVertical,
  vertical,
  drafting,
  onNote,
  onRemember,
  onOnlyVertical,
  onSubmit,
  onCancel,
}: FeedbackFormProps) {
  return (
    <div className="space-y-2 rounded-md border border-dashed p-2">
      <Textarea
        value={note}
        onChange={(e) => onNote(e.target.value)}
        rows={2}
        maxLength={500}
        placeholder="What should Claude change? e.g. They do have a test-drive form; open with the time lost replying to each request by email"
        className="text-sm"
      />
      <div className="flex flex-wrap items-center gap-4 text-xs">
        <label className="flex items-center gap-2">
          <Checkbox checked={remember} onCheckedChange={(v) => onRemember(v === true)} />
          Remember for future drafts
        </label>
        {remember && vertical && (
          <label className="flex items-center gap-2">
            <Checkbox checked={onlyVertical} onCheckedChange={(v) => onOnlyVertical(v === true)} />
            Only for {vertical.replace(/_/g, ' ')} leads
          </label>
        )}
      </div>
      <div className="flex gap-2">
        <Button size="sm" onClick={onSubmit} disabled={note.trim().length < 3 || drafting}>
          {drafting ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Sparkles className="mr-1 h-3 w-3" />}
          Redraft with feedback
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={drafting}>
          Cancel
        </Button>
      </div>
    </div>
  )
}

interface EmailCardProps {
  item: RunEmail
  settings: OutreachSettings
  drafting: boolean
  onDraft: (emailId: string, feedback?: DraftFeedback) => void
  onDecided: () => void
}

// Remounted (by key) whenever the email is redrafted or reviewed, so its
// fields always start from what's saved
function EmailCard({ item, settings, drafting, onDraft, onDecided }: EmailCardProps) {
  const { email, lead } = item
  const saved = parseSteps(email.steps)
  const [subject, setSubject] = useState(saved[0]?.subject ?? defaultSubject(lead))
  const [opener, setOpener] = useState(email.opener ?? '')
  const [customSteps, setCustomSteps] = useState<OutreachEmailStep[] | null>(null)
  const [showFollowUps, setShowFollowUps] = useState(false)
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const [note, setNote] = useState('')
  const [remember, setRemember] = useState(false)
  const [onlyVertical, setOnlyVertical] = useState(false)
  const review = useReviewEmail()
  const updateLead = useUpdateLead()
  const queryClient = useQueryClient()

  const template = templateFor(settings.email_templates, lead.vertical)
  const templateKeys = Object.keys(settings.email_templates)
  const rendered = renderSteps(
    template.steps,
    templateVars(lead, { opener, subject, senderName: settings.sender_name })
  )
  const steps = customSteps ?? rendered
  const audit = parseAudit(email.audit) ?? parseAudit(lead.audit)
  const hook = email.primary_hook ?? (audit ? primaryHook(audit, lead.vertical) : null)
  const findings = audit ? auditFindings(audit, lead.vertical).slice(0, 4) : []
  // The opening line is optional: the template reads fine without one
  const canApprove = !!steps[0]?.subject.trim() && !!steps[0]?.body.trim()

  const editStep = (index: number, body: string) => {
    setCustomSteps((current) =>
      (current ?? rendered).map((step, i) => (i === index ? { ...step, body } : step))
    )
  }

  // Redraft from what's on screen, with the feedback
  const handleFeedback = () => {
    onDraft(email.id, {
      note: note.trim(),
      remember,
      onlyVertical: remember && onlyVertical && !!lead.vertical,
      subject,
      opener,
    })
  }

  // The template follows the lead's vertical, so switching it re-labels the
  // lead too; Claude's next redraft then writes for that vertical
  const handleTemplate = async (key: string) => {
    if (key === template.key) return
    try {
      await updateLead.mutateAsync({ id: lead.id, updates: { vertical: key === 'default' ? null : key } })
      setCustomSteps(null)
      await queryClient.invalidateQueries({ queryKey: ['outreach', 'run-emails'] })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to change the template')
    }
  }

  const handleReview = async (action: 'approve' | 'skip' | 'reopen') => {
    try {
      await review.mutateAsync({ email, action, steps, opener })
      if (action !== 'reopen') onDecided()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save')
    }
  }

  const reviewed = email.status !== 'draft'

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 truncate text-sm">
          <span className="font-medium">{lead.company_name || lead.contact_name}</span>
          <span className="text-muted-foreground">
            {lead.city && ` · ${lead.city}`}
            {lead.email && ` · ${lead.email}`}
          </span>
        </p>
        <StatusBadge status={email.status} />
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1fr)_17rem]">
        <div className="min-w-0 space-y-3">
          {reviewed ? (
            <ReviewedEmail email={email} step={saved[0]} pending={review.isPending} onReopen={() => handleReview('reopen')} />
          ) : (
            <>
              <div className="grid gap-2">
                <Input
                  value={subject}
                  onChange={(e) => {
                    setSubject(e.target.value)
                    setCustomSteps(null)
                  }}
                  placeholder="subject (lowercase, 2–5 words)"
                />
                <Textarea
                  value={opener}
                  onChange={(e) => {
                    setOpener(e.target.value)
                    setCustomSteps(null)
                  }}
                  rows={2}
                  placeholder="Opening line: one specific observation about their business"
                />
              </div>

              {customSteps ? (
                <Textarea
                  value={steps[0]?.body ?? ''}
                  onChange={(e) => editStep(0, e.target.value)}
                  rows={9}
                  className="text-sm"
                />
              ) : (
                <p className="whitespace-pre-line rounded bg-muted/50 p-2 text-sm">{steps[0]?.body}</p>
              )}
              <EmailTools
                words={wordCount(steps[0]?.body ?? '')}
                editing={!!customSteps}
                showFollowUps={showFollowUps}
                onEdit={() => setCustomSteps(rendered)}
                onBackToTemplate={() => setCustomSteps(null)}
                onToggleFollowUps={() => setShowFollowUps((v) => !v)}
              />
            </>
          )}
        </div>

        <div className="min-w-0 space-y-3">
          {(hook || findings.length > 0) && (
            <div className="space-y-1">
              {hook && <Badge variant="outline" className="max-w-full whitespace-normal">{HOOK_LABELS[hook]}</Badge>}
              {findings.length > 0 && (
                <p className="text-xs text-muted-foreground">{findings.join(' · ')}</p>
              )}
            </div>
          )}

          {hook === 'job_post' && <SignalDraftExtras email={email} lead={lead} />}

          {!reviewed && templateKeys.length > 1 && (
            <TemplatePicker
              keys={templateKeys}
              value={template.key}
              disabled={updateLead.isPending || drafting}
              onChange={handleTemplate}
            />
          )}

          {!reviewed && showFollowUps && <FollowUpSteps steps={steps} editing={!!customSteps} onEdit={editStep} />}

          {!reviewed && feedbackOpen && (
            <FeedbackForm
              note={note}
              remember={remember}
              onlyVertical={onlyVertical}
              vertical={lead.vertical}
              drafting={drafting}
              onNote={setNote}
              onRemember={setRemember}
              onOnlyVertical={setOnlyVertical}
              onSubmit={handleFeedback}
              onCancel={() => setFeedbackOpen(false)}
            />
          )}
        </div>
      </div>

      {!reviewed && (
        <DraftActions
          drafted={!!email.drafted_at}
          drafting={drafting}
          pending={review.isPending}
          canApprove={canApprove}
          onDraft={() => onDraft(email.id)}
          onToggleFeedback={() => setFeedbackOpen((v) => !v)}
          onApprove={() => handleReview('approve')}
          onSkip={() => handleReview('skip')}
        />
      )}
    </div>
  )
}

interface EmailListProps {
  items: RunEmail[]
  selectedId: string | undefined
  draftingIds: Set<string>
  onSelect: (emailId: string) => void
}

// Every email in the run at a glance; the chosen one opens beside it
function EmailList({ items, selectedId, draftingIds, onSelect }: EmailListProps) {
  return (
    <div className="divide-y rounded-md border lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
      {items.map(({ email, lead }) => (
        <button
          key={email.id}
          type="button"
          aria-current={email.id === selectedId}
          onClick={() => onSelect(email.id)}
          className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm ${
            email.id === selectedId ? 'bg-muted font-medium' : 'hover:bg-muted/50'
          }`}
        >
          <span className="min-w-0 truncate">{lead.company_name || lead.contact_name}</span>
          {draftingIds.has(email.id) ? (
            <Loader2 className="h-3 w-3 flex-shrink-0 animate-spin" />
          ) : email.status === 'draft' && !email.drafted_at ? (
            <span className="flex-shrink-0 text-xs font-normal text-muted-foreground">Not drafted</span>
          ) : (
            <StatusBadge status={email.status} />
          )}
        </button>
      ))}
    </div>
  )
}

export function WriteStep({ runId }: { runId: string }) {
  const runEmails = useRunEmails(runId)
  const { data: settings } = useOutreachSettings()
  const queryClient = useQueryClient()
  const [draftingIds, setDraftingIds] = useState<Set<string>>(new Set())
  const [batch, setBatch] = useState<{ done: number; total: number } | null>(null)
  // Null follows the first email still to review, so approving moves you on
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const stopRef = useRef(false)

  const items = runEmails.data ?? []
  const count = (status: string) => items.filter((i) => i.email.status === status).length
  const approved = count('approved')
  const skipped = count('skipped')
  const sent = count('sent') + count('queued')
  const toReview = count('draft')
  const undrafted = items.filter((i) => i.email.status === 'draft' && !i.email.drafted_at)

  const setDrafting = (id: string, on: boolean) =>
    setDraftingIds((prev) => {
      const next = new Set(prev)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })

  // Returns false when every remaining draft would fail too (limit, no key)
  const draftOne = async (emailId: string, feedback?: DraftFeedback): Promise<boolean> => {
    setDrafting(emailId, true)
    try {
      const result = await requestPrepare(emailId, feedback)
      if (feedback?.remember) {
        toast.success('Saved as a writing rule for future drafts')
        queryClient.invalidateQueries({ queryKey: ['outreach', 'copy-rules'] })
      }
      if (result.problems.length) {
        toast.warning(`Claude's draft for ${result.lead.company_name || result.lead.contact_name} broke the copy rules, so the opener is blank: ${result.problems.join('; ')}`)
      }
      return true
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to draft'
      toast.error(message)
      return !/daily limit|ANTHROPIC_API_KEY/i.test(message)
    } finally {
      setDrafting(emailId, false)
      queryClient.invalidateQueries({ queryKey: ['outreach', 'run-emails', runId] })
    }
  }

  const handleDraftAll = async () => {
    const queue = undrafted.map((i) => i.email.id)
    stopRef.current = false
    setBatch({ done: 0, total: queue.length })
    const worker = async () => {
      while (queue.length > 0 && !stopRef.current) {
        const id = queue.shift()!
        if (!(await draftOne(id))) stopRef.current = true
        setBatch((b) => b && { ...b, done: b.done + 1 })
      }
    }
    await Promise.all(Array.from({ length: CONCURRENCY }, worker))
    setBatch(null)
  }

  if (runEmails.isLoading || !settings) {
    return (
      <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading drafts...
      </div>
    )
  }
  if (runEmails.error) {
    return (
      <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
        {runEmails.error.message}
      </div>
    )
  }
  if (items.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">No emails to write in this run.</p>
  }

  const selected =
    items.find((i) => i.email.id === selectedId) ?? items.find((i) => i.email.status === 'draft') ?? items[0]

  return (
    <div className="flex flex-col gap-3 lg:min-h-0 lg:flex-1">
      <SendPanel runId={runId} items={items} settings={settings} />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:min-h-0 lg:flex-1 lg:grid-cols-[17rem_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)]">
        <div className="flex flex-col gap-3 lg:min-h-0">
          <div className="space-y-2 text-sm">
            <p>
              {toReview} to review · {approved} approved · {skipped} skipped
              {sent > 0 && ` · ${sent} queued or sent`}
            </p>
            {batch ? (
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Drafting {batch.done} of {batch.total}
                <Button size="sm" variant="ghost" onClick={() => (stopRef.current = true)}>
                  Stop
                </Button>
              </div>
            ) : (
              undrafted.length > 0 && (
                <Button size="sm" onClick={handleDraftAll}>
                  <Sparkles className="mr-1 h-3 w-3" />
                  Draft {undrafted.length} with Claude
                </Button>
              )
            )}
          </div>
          <EmailList items={items} selectedId={selected.email.id} draftingIds={draftingIds} onSelect={setSelectedId} />
          <CopyRulesPanel />
          <p className="text-xs text-muted-foreground">
            Claude writes the subject and opening line from each site check; the rest is your template.
          </p>
        </div>

        <div className="rounded-md border p-3 lg:min-h-0 lg:overflow-y-auto">
          {/* All stay mounted, so edits survive moving to another email */}
          {items.map((item) => (
            <div
              key={`${item.email.id}:${item.email.drafted_at}:${item.email.status}`}
              className={item === selected ? '' : 'hidden'}
            >
              <EmailCard
                item={item}
                settings={settings}
                drafting={draftingIds.has(item.email.id)}
                onDraft={draftOne}
                onDecided={() => setSelectedId(null)}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
