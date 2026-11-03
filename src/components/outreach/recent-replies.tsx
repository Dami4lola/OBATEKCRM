'use client'

import { useEffect, useRef } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Ban } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { requestStatsSync, useAddToDoNotContact, useRecentReplies } from '@/lib/queries/write'
import { REPLY_CLASS_LABELS } from '@/lib/outreach/stats'
import type { ReplyClass } from '@/types/database'

const CLASS_STYLES: Partial<Record<ReplyClass, string>> = {
  interested: 'bg-green-600 text-white',
  unsubscribe: 'bg-destructive text-white',
}

// Replies from the last two weeks. Opening the pop-up also reads the
// mailbox, so a reply shows without waiting for the scheduler.
export function RecentReplies() {
  const replies = useRecentReplies()
  const addToDoNotContact = useAddToDoNotContact()
  const queryClient = useQueryClient()
  const synced = useRef(false)

  useEffect(() => {
    if (synced.current) return
    synced.current = true
    requestStatsSync()
      .then((result) => {
        const interested = result.newReplies.filter((r) => r.replyClass === 'interested')
        for (const reply of interested) toast.success(`${reply.company} replied: interested`)
        if (result.paused) toast.error(result.paused)
        if (result.updated > 0 || result.paused) {
          queryClient.invalidateQueries({ queryKey: ['outreach'] })
        }
      })
      // A nice-to-have here; the scheduler reads the mailbox too
      .catch((error) => console.warn('Inbox sync:', error))
  }, [queryClient])

  const items = replies.data ?? []
  if (items.length === 0) return null

  return (
    <div className="space-y-2">
      <h4 className="text-sm font-medium">Recent replies</h4>
      <div className="divide-y rounded-md border">
        {items.map(({ email, company, address }) => (
          <div key={email.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
            <span className="truncate">{company}</span>
            <div className="flex shrink-0 items-center gap-2">
              <Badge variant="outline" className={email.reply_class ? CLASS_STYLES[email.reply_class] : ''}>
                {email.reply_class ? REPLY_CLASS_LABELS[email.reply_class] : 'Not labelled yet'}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {formatDistanceToNow(new Date(email.replied_at!), { addSuffix: true })}
              </span>
              {address && !email.unsubscribed_at && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-xs"
                  title="They asked not to be emailed and it wasn't caught"
                  disabled={addToDoNotContact.isPending}
                  onClick={() =>
                    addToDoNotContact
                      .mutateAsync({ emailId: email.id, address })
                      .then(() => toast.success(`${address} won't be emailed again`))
                      .catch((error) => toast.error(error instanceof Error ? error.message : 'Failed to save'))
                  }
                >
                  <Ban className="mr-1 h-3 w-3" />
                  Do not contact
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
