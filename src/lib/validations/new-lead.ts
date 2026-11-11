import { z } from 'zod'
import { CONTACT_RULE_MESSAGE, contactNameFor, hasEnoughContactInfo } from '@/lib/import/contact-rule'
import { leadFormToRow, leadSchema, type LeadFormData } from './lead'

// The Add Lead form. Only new leads need two of name, email and company:
// editing a lead you already have must not be blocked by this.
export const newLeadSchema = leadSchema
  .extend({ contact_name: z.string() })
  .superRefine((data, ctx) => {
    if (!hasEnoughContactInfo(data)) {
      ctx.addIssue({ code: 'custom', path: ['contact_name'], message: CONTACT_RULE_MESSAGE })
    }
  })

export function newLeadToRow(data: LeadFormData) {
  return { ...leadFormToRow(data), contact_name: contactNameFor(data) }
}
