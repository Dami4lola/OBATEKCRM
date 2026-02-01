'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { Trash2, Mail, Phone, Building2, DollarSign, Send } from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useUpdateLead, useDeleteLead } from '@/lib/queries/leads'
import { useStages } from '@/lib/queries/stages'
import { leadSchema, type LeadFormData } from '@/lib/validations/lead'
import { ComposeEmailDialog } from '@/components/email/compose-email-dialog'
import type { Lead } from '@/types/database'

interface LeadSheetProps {
  lead: Lead | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function LeadSheet({ lead, open, onOpenChange }: LeadSheetProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [isEmailOpen, setIsEmailOpen] = useState(false)
  const updateLead = useUpdateLead()
  const deleteLead = useDeleteLead()
  const { data: stages = [] } = useStages()

  const form = useForm<LeadFormData>({
    resolver: zodResolver(leadSchema),
    values: lead
      ? {
          contact_name: lead.contact_name,
          company_name: lead.company_name || '',
          email: lead.email || '',
          phone: lead.phone || '',
          value: lead.value ? Number(lead.value) : null,
          payment_terms: lead.payment_terms ?? null,
          notes: lead.notes || '',
          stage_id: lead.stage_id,
        }
      : undefined,
  })

  const currentStage = stages.find((s) => s.id === lead?.stage_id)

  const onSubmit = async (data: LeadFormData) => {
    if (!lead) return

    try {
      await updateLead.mutateAsync({
        id: lead.id,
        updates: {
          ...data,
          value: data.value ?? null,
          payment_terms: data.payment_terms ?? null,
          email: data.email || null,
          phone: data.phone || null,
          company_name: data.company_name || null,
          notes: data.notes || null,
        },
      })
      toast.success('Lead updated successfully')
      setIsEditing(false)
    } catch {
      toast.error('Failed to update lead')
    }
  }

  const handleDelete = async () => {
    if (!lead) return

    try {
      await deleteLead.mutateAsync(lead.id)
      toast.success('Lead deleted successfully')
      onOpenChange(false)
    } catch {
      toast.error('Failed to delete lead')
    }
  }

  if (!lead) return null

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-lg overflow-y-auto">
        <SheetHeader className="space-y-1">
          <div className="flex items-center justify-between">
            <SheetTitle className="text-xl">{lead.contact_name}</SheetTitle>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="icon" className="text-destructive">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Lead</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to delete this lead? This action cannot
                    be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDelete}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
          {currentStage && (
            <Badge
              style={{ backgroundColor: currentStage.color }}
              className="w-fit text-white"
            >
              {currentStage.name}
            </Badge>
          )}
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {!isEditing ? (
            <>
              {/* Contact Info */}
              <div className="space-y-3">
                {lead.company_name && (
                  <div className="flex items-center gap-2 text-sm">
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                    <span>{lead.company_name}</span>
                  </div>
                )}
                {lead.email && (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      <a
                        href={`mailto:${lead.email}`}
                        className="text-primary hover:underline"
                      >
                        {lead.email}
                      </a>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setIsEmailOpen(true)}
                      className="h-7 px-2"
                    >
                      <Send className="h-3 w-3 mr-1" />
                      Send
                    </Button>
                  </div>
                )}
                {lead.phone && (
                  <div className="flex items-center gap-2 text-sm">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <a
                      href={`tel:${lead.phone}`}
                      className="text-primary hover:underline"
                    >
                      {lead.phone}
                    </a>
                  </div>
                )}
                {lead.value && (
                  <div className="flex items-center gap-2 text-sm font-medium text-green-600">
                    <DollarSign className="h-4 w-4" />
                    <span>
                      ${Number(lead.value).toLocaleString()}
                      {lead.payment_terms && (
                        <span className="text-muted-foreground font-normal ml-1">
                          / {lead.payment_terms === 'one_time' ? 'one time' : lead.payment_terms === 'monthly' ? 'mo' : 'hr'}
                        </span>
                      )}
                    </span>
                  </div>
                )}
              </div>

              {/* Notes */}
              {lead.notes && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium">Notes</h4>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                    {lead.notes}
                  </p>
                </div>
              )}

              {/* Timestamps */}
              <div className="space-y-1 text-xs text-muted-foreground border-t pt-4">
                <p>Created: {format(new Date(lead.created_at), 'PPp')}</p>
                <p>Updated: {format(new Date(lead.updated_at), 'PPp')}</p>
              </div>

              <Button onClick={() => setIsEditing(true)} className="w-full">
                Edit Lead
              </Button>
            </>
          ) : (
            <Form {...form}>
              <form
                onSubmit={form.handleSubmit(onSubmit)}
                className="space-y-4"
              >
                <FormField
                  control={form.control}
                  name="contact_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Contact Name *</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="company_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Company</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input type="email" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="value"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Deal Value</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            value={field.value ?? ''}
                            onChange={(e) => {
                              const val = e.target.value
                              field.onChange(val === '' ? null : Number(val))
                            }}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="payment_terms"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Payment Terms</FormLabel>
                        <Select
                          value={field.value ?? ''}
                          onValueChange={(val) => field.onChange(val || null)}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select terms" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="one_time">One Time</SelectItem>
                            <SelectItem value="monthly">Monthly</SelectItem>
                            <SelectItem value="hourly">Hourly</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Notes</FormLabel>
                      <FormControl>
                        <Textarea
                          className="resize-none"
                          rows={3}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex gap-2 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsEditing(false)}
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={updateLead.isPending}
                    className="flex-1"
                  >
                    {updateLead.isPending ? 'Saving...' : 'Save Changes'}
                  </Button>
                </div>
              </form>
            </Form>
          )}
        </div>

        <ComposeEmailDialog
          open={isEmailOpen}
          onOpenChange={setIsEmailOpen}
          lead={lead}
        />
      </SheetContent>
    </Sheet>
  )
}
