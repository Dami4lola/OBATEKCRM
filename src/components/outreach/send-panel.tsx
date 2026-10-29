'use client'

import { useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Info, Loader2, Send } from 'lucide-react'
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
import { requestSend, useCompleteRun, type RunEmail } from '@/lib/queries/write'
import { campaignFor } from '@/lib/outreach/sending'
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

export function SendPanel({ runId, items, settings }: SendPanelProps) {
  const [confirming, setConfirming] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [problems, setProblems] = useState<Problem[]>([])
  const stopRef = useRef(false)
  const queryClient = useQueryClient()
  const completeRun = useCompleteRun()

  const approved = items.filter((i) => i.email.status === 'approved')
  const missingCampaign = approved.filter(
    (i) => !campaignFor(settings.instantly_campaigns, i.lead.vertical)
  ).length
  const sending = progress !== null

  const finishIfDone = async () => {
    await queryClient.invalidateQueries({ queryKey: ['outreach', 'run-emails', runId] })
    const latest = queryClient.getQueryData<RunEmail[]>(['outreach', 'run-emails', runId]) ?? []
    const open = latest.some((i) => i.email.status === 'draft' || i.email.status === 'approved')
    if (!open) {
      await completeRun.mutateAsync({
        runId,
        summary: {
          sent: latest.filter((i) => i.email.status === 'sent').length,
          failed: latest.filter((i) => i.email.status === 'failed').length,
          blocked: latest.filter((i) => i.email.status === 'blocked').length,
        },
      })
      toast.success('Run complete')
    }
  }

  const handleSend = async () => {
    setConfirming(false)
    stopRef.current = false
    setProblems([])
    setProgress({ done: 0, total: approved.length })
    let sent = 0

    // One at a time: Instantly rate-limits, and the daily cap is checked per send
    for (const item of approved) {
      if (stopRef.current) break
      const name = item.lead.company_name || item.lead.contact_name
      try {
        const result = await requestSend(item.email.id)
        if (result.outcome === 'sent') sent++
        else setProblems((p) => [...p, { name, message: result.message ?? result.outcome }])
      } catch (error) {
        // Paused, cap, key or rate limit: the rest would fail the same way
        toast.error(error instanceof Error ? error.message : 'Failed to send')
        break
      } finally {
        setProgress((p) => p && { ...p, done: p.done + 1 })
      }
    }

    setProgress(null)
    queryClient.invalidateQueries({ queryKey: ['leads'] })
    if (sent > 0) toast.success(`${sent} email${sent === 1 ? '' : 's'} handed to Instantly`)
    await finishIfDone()
  }

  if (approved.length === 0 && problems.length === 0) return null

  return (
    <div className="space-y-2 rounded-md border p-3">
      {settings.sending_paused ? (
        <div className="flex gap-2 text-sm text-amber-800 dark:text-amber-300">
          <Info className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <div>
            Sending is paused (warm-up). Approved emails wait here. When
            getobatek.com has finished warming up, turn sending on in the Supabase SQL editor:
            <code className="mt-1 block rounded bg-muted px-2 py-1 text-xs">
              UPDATE outreach_settings SET value = &apos;false&apos;::jsonb WHERE key = &apos;sending_paused&apos;;
            </code>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm">
            {approved.length} approved, ready to send · daily cap {settings.daily_send_cap}
          </p>
          {sending ? (
            <div className="flex items-center gap-2 text-sm">
              <Loader2 className="h-4 w-4 animate-spin" />
              Sending {progress.done} of {progress.total}
              <Button size="sm" variant="ghost" onClick={() => (stopRef.current = true)}>
                Stop
              </Button>
            </div>
          ) : (
            approved.length > 0 && (
              <Button size="sm" onClick={() => setConfirming(true)}>
                <Send className="mr-1 h-3 w-3" />
                Send {approved.length} approved
              </Button>
            )
          )}
        </div>
      )}

      {missingCampaign > 0 && (
        <p className="text-xs text-destructive">
          {missingCampaign} approved email{missingCampaign === 1 ? ' has' : 's have'} no Instantly
          campaign. Add a &quot;default&quot; campaign ID to instantly_campaigns.
        </p>
      )}

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
              Send {approved.length} email{approved.length === 1 ? '' : 's'} through Instantly?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Each lead is added to its Instantly campaign, which sends email 1 on its schedule and
              the follow-ups after. The leads move to {settings.target_stage_name}. Each one is
              checked again for suppressions, CASL and the {settings.daily_send_cap}-a-day cap
              before it goes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleSend}>Send</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
