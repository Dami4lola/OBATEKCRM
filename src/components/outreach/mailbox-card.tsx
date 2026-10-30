'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { Mail } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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
import { useDisconnectMailbox, useMailboxStatus } from '@/lib/queries/write'

// A full page load: the route redirects to Microsoft's sign-in
const CONNECT_URL = '/api/outreach/mailbox/connect'

// The Microsoft 365 mailbox outreach is sent from (OUTREACH_PLAN.md §11)
export function MailboxCard() {
  const { data: mailbox, isLoading } = useMailboxStatus()
  const disconnect = useDisconnectMailbox()
  const [confirming, setConfirming] = useState(false)

  const onDisconnect = async () => {
    try {
      await disconnect.mutateAsync()
      toast.success('Sending mailbox disconnected')
    } catch {
      toast.error('Failed to disconnect the mailbox')
    } finally {
      setConfirming(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail className="h-5 w-5" />
          Sending mailbox
        </CardTitle>
        <CardDescription>
          Outreach goes out from this Microsoft 365 mailbox. Replies, bounces and &quot;unsubscribe&quot;
          replies are read from it.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : !mailbox ? (
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground">
              No mailbox connected. Sign in with the getobatek.com mailbox.
            </p>
            <Button asChild>
              <a href={CONNECT_URL}>Connect</a>
            </Button>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-medium">{mailbox.address}</span>
                {mailbox.status === 'connected' ? (
                  <Badge variant="secondary">Connected</Badge>
                ) : (
                  <Badge variant="destructive">Needs reconnecting</Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Connected {format(new Date(mailbox.connected_at), 'MMM d, yyyy')}
                {mailbox.inbox_checked_at &&
                  ` · inbox read ${format(new Date(mailbox.inbox_checked_at), 'MMM d, h:mm a')}`}
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" asChild>
                <a href={CONNECT_URL}>Reconnect</a>
              </Button>
              <Button variant="ghost" className="text-destructive" onClick={() => setConfirming(true)}>
                Disconnect
              </Button>
            </div>
          </div>
        )}
      </CardContent>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect the sending mailbox?</AlertDialogTitle>
            <AlertDialogDescription>
              Queued emails and follow-ups wait, and replies aren&apos;t read, until a mailbox is
              connected again. The saved login is deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={onDisconnect}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Disconnect
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}
