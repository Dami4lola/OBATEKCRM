import { z } from 'zod'

export const importRowSchema = z.object({
  contact_name: z.string().min(1, 'Contact name is required'),
  company_name: z.string().nullable().optional(),
  email: z.union([z.string().email('Invalid email'), z.literal(''), z.null()]).optional(),
  phone: z.string().nullable().optional(),
  value: z.number().min(0).nullable().optional(),
  payment_terms: z.enum(['one_time', 'monthly', 'hourly']).nullable().optional(),
  notes: z.string().nullable().optional(),
  job_title: z.string().nullable().optional(),
  website: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  region: z.string().nullable().optional(),
  country: z.string().length(2).nullable().optional(),
  vertical: z.string().nullable().optional(),
  staff_size: z.number().int().min(1).nullable().optional(),
  linkedin_url: z.string().nullable().optional(),
})

export type ImportRowData = z.infer<typeof importRowSchema>

export function validateImportRow(data: unknown): {
  valid: boolean
  data?: ImportRowData
  errors: string[]
} {
  const result = importRowSchema.safeParse(data)
  if (result.success) {
    return { valid: true, data: result.data, errors: [] }
  }
  return {
    valid: false,
    errors: result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`)
  }
}
