'use client'

import { useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { MailboxCard } from '@/components/outreach/mailbox-card'

// Fixed codes from /api/outreach/mailbox/callback; nothing from the URL is shown as-is
const MAILBOX_ERRORS: Record<string, string> = {
  denied: 'Microsoft sign-in was cancelled or refused.',
  state: "The sign-in expired or didn't match. Try connecting again.",
  access: 'Only team members can connect the sending mailbox.',
  domain: "That account isn't on the sending domain. Sign in with the getobatek.com mailbox.",
  config:
    'Set AZURE_CLIENT_ID, AZURE_CLIENT_SECRET, AZURE_TENANT_ID and MAIL_TOKEN_KEY in .env.local, then restart npm run dev.',
  failed: 'Connecting the mailbox failed. The terminal running npm run dev has the details.',
}

export default function SettingsPage() {
  const searchParams = useSearchParams()

  // Result of the Microsoft sign-in redirect
  useEffect(() => {
    const connected = searchParams.get('mailbox')
    const error = searchParams.get('mailbox_error')
    if (connected === 'connected') {
      toast.success('Sending mailbox connected')
      window.history.replaceState({}, '', '/settings')
    } else if (error) {
      toast.error(MAILBOX_ERRORS[error] ?? MAILBOX_ERRORS.failed)
      window.history.replaceState({}, '', '/settings')
    }
  }, [searchParams])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground">Manage your CRM settings and integrations</p>
      </div>

      <MailboxCard />
    </div>
  )
}
