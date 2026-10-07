'use client'

import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { Building2, Trash2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  useCreateMeeting,
  useUpdateMeeting,
  useDeleteMeeting,
} from '@/lib/queries/meetings'
import {
  meetingSchema,
  MEETING_ROLES,
  type MeetingFormData,
} from '@/lib/validations/meeting'
import { FieldOfWorkInput } from './field-of-work-input'
import type { Lead, Meeting } from '@/types/database'

const DATETIME_LOCAL = "yyyy-MM-dd'T'HH:mm"

interface MeetingFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  lead: Pick<Lead, 'id' | 'contact_name' | 'company_name'> | null
  // When set, the dialog edits this meeting instead of logging a new one
  meeting?: Meeting | null
}

export function MeetingFormDialog({
  open,
  onOpenChange,
  lead,
  meeting,
}: MeetingFormDialogProps) {
  const createMeeting = useCreateMeeting()
  const updateMeeting = useUpdateMeeting()
  const deleteMeeting = useDeleteMeeting()
  const isEditing = !!meeting

  const form = useForm<MeetingFormData>({
    resolver: zodResolver(meetingSchema),
    defaultValues: {
      title: '',
      meeting_date: '',
      attendee_name: '',
      attendee_role: 'employee',
      field_of_work: '',
      notes: '',
      outcome: '',
    },
  })

  // Load the meeting (or fresh defaults for this lead) each time the dialog opens
  useEffect(() => {
    if (!open) return
    form.reset(
      meeting
        ? {
            title: meeting.title,
            meeting_date: format(new Date(meeting.meeting_date), DATETIME_LOCAL),
            attendee_name: meeting.attendee_name,
            attendee_role: meeting.attendee_role,
            field_of_work: meeting.field_of_work || '',
            notes: meeting.notes || '',
            outcome: meeting.outcome || '',
          }
        : {
            title: '',
            meeting_date: format(new Date(), DATETIME_LOCAL),
            attendee_name: lead?.contact_name || '',
            attendee_role: 'employee',
            field_of_work: '',
            notes: '',
            outcome: '',
          }
    )
  }, [open, meeting, lead, form])

  const onSubmit = async (data: MeetingFormData) => {
    if (!lead) return

    const values = {
      ...data,
      meeting_date: new Date(data.meeting_date).toISOString(),
      field_of_work: data.field_of_work?.trim() || null,
      notes: data.notes || null,
      outcome: data.outcome || null,
    }

    try {
      if (meeting) {
        await updateMeeting.mutateAsync({ id: meeting.id, updates: values })
        toast.success('Meeting updated')
      } else {
        await createMeeting.mutateAsync({ ...values, lead_id: lead.id })
        toast.success('Meeting logged')
      }
      onOpenChange(false)
    } catch {
      toast.error(meeting ? 'Failed to update meeting' : 'Failed to log meeting')
    }
  }

  const handleDelete = async () => {
    if (!meeting) return

    try {
      await deleteMeeting.mutateAsync(meeting.id)
      toast.success('Meeting deleted')
      onOpenChange(false)
    } catch {
      toast.error('Failed to delete meeting')
    }
  }

  const isPending = createMeeting.isPending || updateMeeting.isPending

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Meeting' : 'Log Meeting'}</DialogTitle>
          {lead && (
            <DialogDescription className="flex items-center gap-1.5">
              <Building2 className="h-3.5 w-3.5" />
              {lead.company_name || 'No company'} · {lead.contact_name}
            </DialogDescription>
          )}
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Title *</FormLabel>
                  <FormControl>
                    <Input placeholder="Discovery call" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="meeting_date"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Date & Time *</FormLabel>
                  <FormControl>
                    <Input type="datetime-local" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="attendee_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Met With *</FormLabel>
                    <FormControl>
                      <Input placeholder="Jane Doe" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="attendee_role"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Role *</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select role" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {MEETING_ROLES.map((role) => (
                          <SelectItem key={role.value} value={role.value}>
                            {role.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="field_of_work"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Field of Work</FormLabel>
                  <FieldOfWorkInput
                    // Remount per meeting so the list/free-text toggle resets
                    key={`${meeting?.id ?? 'new'}-${open}`}
                    value={field.value}
                    onChange={field.onChange}
                  />
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="What was discussed..."
                      className="resize-none"
                      rows={3}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="outcome"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Outcome / Next Steps</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Send proposal by Friday..."
                      className="resize-none"
                      rows={2}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex items-center gap-2 pt-4">
              {isEditing && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete Meeting</AlertDialogTitle>
                      <AlertDialogDescription>
                        Are you sure you want to delete this meeting? This action
                        cannot be undone.
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
              )}
              <div className="flex flex-1 justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isPending}>
                  {isPending
                    ? 'Saving...'
                    : isEditing
                      ? 'Save Changes'
                      : 'Log Meeting'}
                </Button>
              </div>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
