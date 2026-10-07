import { z } from 'zod'

export const MEETING_ROLES = [
  { value: 'employee', label: 'Employee' },
  { value: 'decision_maker', label: 'Decision maker' },
] as const

export const FIELDS_OF_WORK = [
  'Technology',
  'Finance',
  'Healthcare',
  'Retail',
  'Manufacturing',
  'Real Estate',
  'Education',
  'Energy',
  'Logistics',
  'Government',
  'Hospitality',
  'Agriculture',
]

export function getRoleLabel(role: string) {
  return MEETING_ROLES.find((r) => r.value === role)?.label ?? role
}

export const meetingSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  meeting_date: z.string().min(1, 'Date is required'),
  attendee_name: z.string().min(1, 'Attendee name is required'),
  attendee_role: z.enum(['employee', 'decision_maker']),
  field_of_work: z.string().optional(),
  notes: z.string().optional(),
  outcome: z.string().optional(),
})

export type MeetingFormData = z.infer<typeof meetingSchema>
