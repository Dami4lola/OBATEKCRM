'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Info, Loader2, MailCheck, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
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
import {
  requestSend,
  requestTestSend,
  useCompleteRun,
  useMailboxStatus,
  type RunEmail,
} from '@/lib/queries/write'
import { effectiveDailyCap } from '@/lib/outreach/sequence'
import type { OutreachSettings } from '@/lib/outreach/settings'

interface SendPanelProps {
  runId: string
  items: RunEmail[]
  settings: OutreachSettings
}

interface Problem {
  name: string
  message: string
}

// Approved emails are queued here; the scheduler sends them from the
// mailbox a few at a time (OUTREACH_PLAN.md §11)
export function SendPanel({ runId, items, settings }: SendPanelProps) {
  const [confirming, setConfirming] = useState(false)
  const [testing, setTesting] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [problems, setProblems] = useState<Problem[]>([])
  const stopRef = useRef(false)
  const queryClient = useQueryClient()
  const completeRun = useCompleteRun()
  const { data: mailbox } = useMailboxStatus()

  const approved = items.filter((i) => i.email.status === 'approved')
  const queued = items.filter((i) => i.email.status === 'queued').length
  const queueing = progress !== null
  // The ramp step for this week (bounce and seed holds are applied when sending)
  const { cap, week } = effectiveDailyCap(settings, { sent7d: 0, bounced7d: 0, lastSeedSpam: false, now: new Date() })
  const { start, end, weekdays_only } = settings.send_window

  const finishIfDone = async () => {
    await queryClient.invalidateQueries({ queryKey: ['outreach', 'run-emails', runId] })
    const latest = queryClient.getQueryData<RunEmail[]>(['outreach', 'run-emails', runId]) ?? []
    const open = latest.some((i) => i.email.status === 'draft' || i.email.status === 'approved')
    if (!open) {
      await completeRun.mutateAsync({
        runId,
        summary: {
          sent: latest.filter((i) => i.email.status === 'queued' || i.email.status === 'sent').length,
          failed: latest.filter((i) => i.email.status === 'failed').length,
          blocked: latest.filter((i) => i.email.status === 'blocked').length,
        },
      })
      toast.success('Run complete. Queued emails go out on the scheduler.')
    }
  }

  const handleQueue = async () => {
    setConfirming(false)
    stopRef.current = false
    setProblems([])
    setProgress({ done: 0, total: approved.length })
    let done = 0

    for (const item of approved) {
      if (stopRef.current) break
      const name = item.lead.company_name || item.lead.contact_name
      try {
        const result = await requestSend(item.email.id)
        if (result.outcome === 'queued') done++
        else setProblems((p) => [...p, { name, message: result.message ?? result.outcome }])
      } catch (error) {
        // Paused, or a server problem: the rest would fail the same way
        toast.error(error instanceof Error ? error.message : 'Failed to queue')
        break
      } finally {
        setProgress((p) => p && { ...p, done: p.done + 1 })
      }
    }

    setProgress(null)
    if (done > 0) toast.success(`${done} email${done === 1 ? '' : 's'} queued`)
    await finishIfDone()
  }

  const handleTest = async () => {
    const first = approved[0]
    if (!first) return
    setTesting(true)
    try {
      const { sentTo } = await requestTestSend(first.email.id)
      toast.success(`Test sent to ${sentTo}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to send the test')
    } finally {
      setTesting(false)
    }
  }

  if (approved.length === 0 && queued === 0 && problems.length === 0) return null

  return (
    <div className="space-y-2 rounded-md border p-3">
      {settings.sending_paused && (
        <div className="flex gap-2 text-sm text-amber-800 dark:text-amber-300">
          <Info className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <div>
            {settings.sending_paused_reason ? (
              <>{settings.sending_paused_reason} Approved emails wait here. </>
            ) : (
              <>Sending is paused. Approved emails wait here. When you&apos;re ready to start, </>
            )}
            turn sending on in the Supabase SQL editor:
            <code className="mt-1 block rounded bg-muted px-2 py-1 text-xs">
              UPDATE outreach_settings SET value = &apos;false&apos;::jsonb WHERE key = &apos;sending_paused&apos;;
              UPDATE outreach_settings SET value = &apos;null&apos;::jsonb WHERE key = &apos;sending_paused_reason&apos;;
            </code>
          </div>
        </div>
      )}

      {mailbox?.status !== 'connected' && (
        <p className="text-sm text-amber-800 dark:text-amber-300">
          {mailbox ? 'The sending mailbox needs reconnecting.' : 'No sending mailbox is connected.'} Queued
          emails wait until it is.{' '}
          <Link href="/settings" className="underline">
            Open Settings
          </Link>
        </p>
      )}

      {!settings.sending_paused && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm">
            {approved.length} approved
            {queued > 0 && ` · ${queued} queued`}
          </p>
          {queueing ? (
            <div className="flex items-center gap-2 text-sm">
              <Loader2 className="h-4 w-4 animate-spin" />
              Queueing {progress.done} of {progress.total}
              <Button size="sm" variant="ghost" onClick={() => (stopRef.current = true)}>
                Stop
              </Button>
            </div>
          ) : (
            approved.length > 0 && (
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={handleTest} disabled={testing || mailbox?.status !== 'connected'}>
                  {testing ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <MailCheck className="mr-1 h-3 w-3" />}
                  Send test to me
                </Button>
                <Button size="sm" onClick={() => setConfirming(true)}>
                  <Send className="mr-1 h-3 w-3" />
                  Queue {approved.length} approved
                </Button>
              </div>
            )
          )}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        The scheduler sends {settings.sends_per_tick} every 5 minutes, {weekdays_only ? 'weekdays ' : ''}
        {start}–{end} ({settings.send_timezone.replace(/^.*\//, '').replace(/_/g, ' ')} time), up to {cap} a day
        {week ? ` (warm-up week ${week})` : ' (warm-up starts with the first send)'}. Follow-ups count toward
        that, so expect about {Math.max(1, Math.floor(cap / 3))} new leads a day once sequences are running.
      </p>

      {problems.length > 0 && (
        <ul className="space-y-0.5 text-xs text-destructive">
          {problems.map((p) => (
            <li key={`${p.name}:${p.message}`}>
              {p.name}: {p.message}
            </li>
          ))}
        </ul>
      )}

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Queue {approved.length} email{approved.length === 1 ? '' : 's'}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              The scheduler (npm run outreach:scheduler) sends them from {mailbox?.address ?? 'the sending mailbox'}{' '}
              during the send window, then emails 2 and 3 as replies in the same thread unless the lead
              replies, bounces or unsubscribes. Each lead moves to {settings.target_stage_name} when email 1
              goes, and is checked again for suppressions, CASL and the daily limit first.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleQueue}>Queue</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
