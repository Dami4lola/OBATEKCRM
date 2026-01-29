import { z } from 'zod'

export const leadSchema = z.object({
  contact_name: z.string().min(1, 'Contact name is required'),
  company_name: z.string().optional(),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  phone: z.string().optional(),
  value: z.coerce.number().min(0).optional().nullable(),
  notes: z.string().optional(),
  stage_id: z.string().uuid('Invalid stage'),
})

export type LeadFormData = z.infer<typeof leadSchema>
