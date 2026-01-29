import { z } from 'zod'

export const leadSchema = z.object({
  contact_name: z.string().min(1, 'Contact name is required'),
  company_name: z.string().optional(),
  email: z.union([z.string().email('Invalid email'), z.literal('')]).optional(),
  phone: z.string().optional(),
  value: z.number().min(0).nullable().optional(),
  notes: z.string().optional(),
  stage_id: z.string().uuid('Invalid stage'),
})

export type LeadFormData = z.infer<typeof leadSchema>
