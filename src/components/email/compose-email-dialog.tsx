'use client'

import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Loader2, Mail } from 'lucide-react'
import { useEmailAccounts, useSendEmail } from '@/lib/queries/email-accounts'
import type { Lead } from '@/types/database'

const emailSchema = z.object({
  emailAccountId: z.string().min(1, 'Select an email account'),
  subject: z.string().min(1, 'Subject is required'),
  body: z.string().min(1, 'Message is required'),
})

type EmailFormData = z.infer<typeof emailSchema>

interface ComposeEmailDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  lead: Lead | null
}

export function ComposeEmailDialog({
  open,
  onOpenChange,
  lead,
}: ComposeEmailDialogProps) {
  const { data: accounts = [] } = useEmailAccounts()
  const sendEmail = useSendEmail()

  const form = useForm<EmailFormData>({
    resolver: zodResolver(emailSchema),
    defaultValues: {
      emailAccountId: '',
      subject: '',
      body: '',
    },
  })

  // Set default account when accounts load
  useEffect(() => {
    if (accounts.length > 0 && !form.getValues('emailAccountId')) {
      form.setValue('emailAccountId', accounts[0].id)
    }
  }, [accounts, form])

  // Reset form when dialog closes
  useEffect(() => {
    if (!open) {
      form.reset()
    }
  }, [open, form])

  const onSubmit = async (data: EmailFormData) => {
    if (!lead?.email) {
      toast.error('Lead has no email address')
      return
    }

    try {
      await sendEmail.mutateAsync({
        emailAccountId: data.emailAccountId,
        leadId: lead.id,
        to: lead.email,
        subject: data.subject,
        body: data.body,
      })
      toast.success('Email sent successfully')
      form.reset()
      onOpenChange(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to send email')
    }
  }

  if (!lead) return null

  if (accounts.length === 0) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>No Email Account Connected</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-muted-foreground mb-4">
              Please connect an email account first to send emails.
            </p>
            <Button asChild className="w-full">
              <a href="/settings">Go to Settings</a>
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  if (!lead.email) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>No Email Address</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground py-4">
            This lead doesn&apos;t have an email address. Please add one first.
          </p>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Send Email to {lead.contact_name}
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="text-sm text-muted-foreground bg-gray-50 dark:bg-gray-800 px-3 py-2 rounded-md">
              To: {lead.email}
            </div>

            <FormField
              control={form.control}
              name="emailAccountId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>From</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select account" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {accounts.map((account) => (
                        <SelectItem key={account.id} value={account.id}>
                          <div className="flex items-center gap-2">
                            <span className="capitalize">{account.provider}</span>
                            <span className="text-muted-foreground">
                              ({account.email_address})
                            </span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="subject"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Subject</FormLabel>
                  <FormControl>
                    <Input placeholder="Email subject" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="body"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Message</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Write your message..."
                      className="min-h-32 resize-none"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={sendEmail.isPending}>
                {sendEmail.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Sending...
                  </>
                ) : (
                  'Send Email'
                )}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
