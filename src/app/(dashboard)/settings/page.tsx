'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { Plus, Trash2, Mail } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
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
import { ConnectEmailDialog } from '@/components/email/connect-email-dialog'
import { useEmailAccounts, useDeleteEmailAccount } from '@/lib/queries/email-accounts'

export default function SettingsPage() {
  const [isConnectOpen, setIsConnectOpen] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const searchParams = useSearchParams()

  const { data: accounts = [], isLoading } = useEmailAccounts()
  const deleteAccount = useDeleteEmailAccount()

  // Handle success/error messages from OAuth redirects
  useEffect(() => {
    const success = searchParams.get('success')
    const error = searchParams.get('error')

    if (success === 'email_connected') {
      toast.success('Email account connected successfully')
      // Clean up URL
      window.history.replaceState({}, '', '/settings')
    } else if (error === 'oauth_failed') {
      toast.error('Failed to connect email account. Please try again.')
      window.history.replaceState({}, '', '/settings')
    } else if (error === 'oauth_init_failed') {
      toast.error('Failed to initialize OAuth. Check your environment variables.')
      window.history.replaceState({}, '', '/settings')
    }
  }, [searchParams])

  const handleDelete = async () => {
    if (!deleteId) return
    try {
      await deleteAccount.mutateAsync(deleteId)
      toast.success('Email account disconnected')
      setDeleteId(null)
    } catch {
      toast.error('Failed to disconnect email account')
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground">Manage your CRM settings and integrations</p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Mail className="h-5 w-5" />
                Email Accounts
              </CardTitle>
              <CardDescription>
                Connect your Outlook account to send emails directly from the CRM
              </CardDescription>
            </div>
            <Button onClick={() => setIsConnectOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Connect Account
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">
              Loading email accounts...
            </div>
          ) : accounts.length === 0 ? (
            <div className="text-center py-8">
              <Mail className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground mb-4">
                No email accounts connected yet
              </p>
              <Button variant="outline" onClick={() => setIsConnectOpen(true)}>
                Connect your first account
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {accounts.map((account) => (
                <div
                  key={account.id}
                  className="flex items-center justify-between p-4 border rounded-lg"
                >
                  <div className="flex items-center gap-4">
                    <div className="h-10 w-10 rounded-full flex items-center justify-center bg-blue-100 text-blue-600">
                      <svg className="h-5 w-5" viewBox="0 0 24 24">
                        <path
                          fill="currentColor"
                          d="M24 7.387v10.478c0 .23-.08.424-.238.576-.158.154-.352.231-.582.231h-8.026v-6.18l1.526 1.145.76-.973-2.904-2.168v-.001l-.257.192-2.902 2.168.76.973 1.526-1.145v6.18H0V7.387l8.023 5.255L24 7.387z"
                        />
                      </svg>
                    </div>
                    <div>
                      <p className="font-medium">{account.email_address}</p>
                      <Badge variant="secondary" className="capitalize">
                        {account.provider}
                      </Badge>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive hover:text-destructive"
                    onClick={() => setDeleteId(account.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <ConnectEmailDialog open={isConnectOpen} onOpenChange={setIsConnectOpen} />

      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect Email Account</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to disconnect this email account? You won&apos;t
              be able to send emails from this account until you reconnect it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Disconnect
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
