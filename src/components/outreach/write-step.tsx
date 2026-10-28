'use client'

import { useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Check, ChevronDown, ChevronRight, Loader2, Sparkles, Undo2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { requestPrepare, useReviewEmail, useRunEmails, type RunEmail } from '@/lib/queries/write'
import { useOutreachSettings } from '@/lib/queries/outreach'
import { auditFindings, HOOK_LABELS, parseAudit, primaryHook } from '@/lib/outreach/audit-findings'
import { parseSteps, renderSteps, templateFor, templateVars, wordCount } from '@/lib/outreach/templates'
import type { OutreachSettings } from '@/lib/outreach/settings'
import type { OutreachEmailStep } from '@/types/database'

const CONCURRENCY = 3
const EMAIL_1_MAX_WORDS = 90

interface EmailCardProps {
  item: RunEmail
  settings: OutreachSettings
  drafting: boolean
  onDraft: (emailId: string) => void
}

// Remounted (by key) whenever the email is redrafted or reviewed, so its
// fields always start from what's saved
function EmailCard({ item, settings, drafting, onDraft }: EmailCardProps) {
  const { email, lead } = item
  const saved = parseSteps(email.steps)
  const [subject, setSubject] = useState(saved[0]?.subject ?? '')
  const [opener, setOpener] = useState(email.opener ?? '')
  const [customSteps, setCustomSteps] = useState<OutreachEmailStep[] | null>(null)
  const [showFollowUps, setShowFollowUps] = useState(false)
  const review = useReviewEmail()

  const template = templateFor(settings.email_templates, lead.vertical)
  const rendered = renderSteps(
    template.steps,
    templateVars(lead, { opener, subject, senderName: settings.sender_name })
  )
  const steps = customSteps ?? rendered
  const audit = parseAudit(email.audit) ?? parseAudit(lead.audit)
  const hook = email.primary_hook ?? (audit ? primaryHook(audit) : null)
  const findings = audit ? auditFindings(audit).slice(0, 4) : []
  const words = wordCount(steps[0]?.body ?? '')
  const canApprove = !!steps[0]?.subject.trim() && (customSteps !== null || opener.trim().length > 0)

  const editStep = (index: number, body: string) => {
    setCustomSteps((current) =>
      (current ?? rendered).map((step, i) => (i === index ? { ...step, body } : step))
    )
  }

  const handleReview = async (action: 'approve' | 'skip' | 'reopen') => {
    try {
      await review.mutateAsync({ email, action, steps, opener })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save')
    }
  }

  const reviewed = email.status === 'approved' || email.status === 'skipped'

  return (
    <div className={`space-y-3 rounded-md border p-3 ${reviewed ? 'bg-muted/30' : ''}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">
            {lead.company_name || lead.contact_name}
            {lead.city && <span className="font-normal text-muted-foreground"> · {lead.city}</span>}
          </p>
          <p className="truncate text-xs text-muted-foreground">{lead.email}</p>
        </div>
        {email.status === 'approved' && <Badge className="bg-green-600">Approved</Badge>}
        {email.status === 'skipped' && <Badge variant="outline">Skipped</Badge>}
      </div>

      {(hook || findings.length > 0) && (
        <div className="space-y-1">
          {hook && <Badge variant="outline">{HOOK_LABELS[hook]}</Badge>}
          {findings.length > 0 && (
            <p className="text-xs text-muted-foreground">{findings.join(' · ')}</p>
          )}
        </div>
      )}

      {reviewed ? (
        <div className="space-y-2">
          <p className="text-sm font-medium">{saved[0]?.subject}</p>
          <p className="whitespace-pre-line text-sm text-muted-foreground">{saved[0]?.body}</p>
          <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => handleReview('reopen')} disabled={review.isPending}>
            <Undo2 className="mr-1 h-3 w-3" />
            Undo
          </Button>
        </div>
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
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span className={words > EMAIL_1_MAX_WORDS ? 'text-amber-600' : ''}>
              {words} words{words > EMAIL_1_MAX_WORDS && ` (aim for under ${EMAIL_1_MAX_WORDS})`}
            </span>
            {!customSteps && (
              <button type="button" className="underline" onClick={() => setCustomSteps(rendered)}>
                Edit full emails
              </button>
            )}
            {customSteps && (
              <button type="button" className="underline" onClick={() => setCustomSteps(null)}>
                Back to template
              </button>
            )}
            <button
              type="button"
              className="flex items-center gap-1 underline"
              onClick={() => setShowFollowUps((v) => !v)}
            >
              {showFollowUps ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              Emails 2–3
            </button>
          </div>

          {showFollowUps &&
            steps.slice(1).map((step, i) =>
              customSteps ? (
                <Textarea
                  key={step.step}
                  value={step.body}
                  onChange={(e) => editStep(i + 1, e.target.value)}
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

          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => onDraft(email.id)} disabled={drafting || review.isPending}>
              {drafting ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Sparkles className="mr-1 h-3 w-3" />}
              {email.drafted_at ? 'Redraft with Claude' : 'Draft with Claude'}
            </Button>
            <Button size="sm" onClick={() => handleReview('approve')} disabled={!canApprove || drafting || review.isPending}>
              <Check className="mr-1 h-3 w-3" />
              Approve
            </Button>
            <Button size="sm" variant="ghost" onClick={() => handleReview('skip')} disabled={drafting || review.isPending}>
              <X className="mr-1 h-3 w-3" />
              Skip
            </Button>
          </div>
        </>
      )}
    </div>
  )
}

export function WriteStep({ runId }: { runId: string }) {
  const runEmails = useRunEmails(runId)
  const { data: settings } = useOutreachSettings()
  const queryClient = useQueryClient()
  const [draftingIds, setDraftingIds] = useState<Set<string>>(new Set())
  const [batch, setBatch] = useState<{ done: number; total: number } | null>(null)
  const stopRef = useRef(false)

  const items = runEmails.data ?? []
  const approved = items.filter((i) => i.email.status === 'approved').length
  const skipped = items.filter((i) => i.email.status === 'skipped').length
  const toReview = items.length - approved - skipped
  const undrafted = items.filter((i) => i.email.status === 'draft' && !i.email.drafted_at)

  const setDrafting = (id: string, on: boolean) =>
    setDraftingIds((prev) => {
      const next = new Set(prev)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })

  // Returns false when every remaining draft would fail too (limit, no key)
  const draftOne = async (emailId: string): Promise<boolean> => {
    setDrafting(emailId, true)
    try {
      const result = await requestPrepare(emailId)
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

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span>
          {approved} approved · {skipped} skipped · {toReview} to review
        </span>
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
      <p className="text-xs text-muted-foreground">
        Claude writes the subject and opening line from each site check; the rest is
        your template. Nothing is sent yet: approved emails go out once sending is set up.
      </p>
      <div className="max-h-[55vh] space-y-3 overflow-y-auto pr-1">
        {items.map((item) => (
          <EmailCard
            key={`${item.email.id}:${item.email.drafted_at}:${item.email.status}`}
            item={item}
            settings={settings}
            drafting={draftingIds.has(item.email.id)}
            onDraft={draftOne}
          />
        ))}
      </div>
    </div>
  )
}
