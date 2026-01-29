'use client'

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

interface ConnectEmailDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ConnectEmailDialog({ open, onOpenChange }: ConnectEmailDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Connect Email Account</DialogTitle>
          <DialogDescription>
            Connect your Outlook account to send emails directly from the CRM.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <Button
            variant="outline"
            className="w-full justify-start gap-3 h-14"
            asChild
          >
            <a href="/api/oauth/outlook">
              <svg className="h-5 w-5" viewBox="0 0 24 24">
                <path
                  fill="#0078D4"
                  d="M24 7.387v10.478c0 .23-.08.424-.238.576-.158.154-.352.231-.582.231h-8.026v-6.18l1.526 1.145.76-.973-2.904-2.168v-.001l-.257.192-2.902 2.168.76.973 1.526-1.145v6.18H0V7.387l8.023 5.255L24 7.387zM9.71 0h12.615v5.233L9.71 12.702 0 5.233V2.328C0 1.687.198 1.143.594.697A2.098 2.098 0 0 1 2.13 0h7.58z"
                />
              </svg>
              Connect Outlook
            </a>
          </Button>
        </div>

        <p className="text-xs text-muted-foreground text-center">
          Your email credentials are stored securely and only used to send emails on
          your behalf.
        </p>
      </DialogContent>
    </Dialog>
  )
}
