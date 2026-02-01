import type { ColumnMapping, LeadImportFields } from './types'

const FIELD_ALIASES: Record<keyof LeadImportFields, string[]> = {
  contact_name: ['name', 'contact', 'contact_name', 'full_name', 'fullname', 'person', 'contactname'],
  company_name: ['company', 'company_name', 'organization', 'org', 'business', 'companyname'],
  email: ['email', 'email_address', 'mail', 'e-mail', 'emailaddress'],
  phone: ['phone', 'phone_number', 'tel', 'telephone', 'mobile', 'number', 'phonenumber', 'cell'],
  value: ['value', 'deal_value', 'amount', 'worth', 'price', 'dealvalue'],
  payment_terms: ['payment_terms', 'payment', 'terms', 'billing', 'frequency', 'paymentterms'],
  notes: ['notes', 'note', 'description', 'comments', 'comment', 'remarks'],
}

export function autoMapColumns(headers: string[]): ColumnMapping[] {
  return headers.map((header) => {
    const normalizedHeader = header.toLowerCase().trim().replace(/[\s_-]+/g, '_')

    for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
      if (aliases.some(alias => normalizedHeader.includes(alias) || alias.includes(normalizedHeader))) {
        return { sourceColumn: header, targetField: field as keyof LeadImportFields }
      }
    }

    return { sourceColumn: header, targetField: null }
  })
}

export function applyMapping(
  row: Record<string, string | number | null>,
  mappings: ColumnMapping[]
): Partial<LeadImportFields> {
  const result: Partial<LeadImportFields> = {}

  for (const mapping of mappings) {
    if (mapping.targetField && row[mapping.sourceColumn] != null) {
      const value = row[mapping.sourceColumn]
      const stringValue = String(value) || undefined

      switch (mapping.targetField) {
        case 'value': {
          const numValue = typeof value === 'number' ? value : parseFloat(String(value))
          result.value = isNaN(numValue) ? null : numValue
          break
        }
        case 'payment_terms': {
          const terms = String(value).toLowerCase().trim()
          if (terms === 'one_time' || terms === 'onetime' || terms === 'one time') {
            result.payment_terms = 'one_time'
          } else if (terms === 'monthly' || terms === 'month' || terms === 'mo') {
            result.payment_terms = 'monthly'
          } else if (terms === 'hourly' || terms === 'hour' || terms === 'hr') {
            result.payment_terms = 'hourly'
          } else {
            result.payment_terms = null
          }
          break
        }
        case 'contact_name':
          result.contact_name = String(value)
          break
        case 'company_name':
          result.company_name = stringValue ?? null
          break
        case 'email':
          result.email = stringValue ?? null
          break
        case 'phone':
          result.phone = stringValue ?? null
          break
        case 'notes':
          result.notes = stringValue ?? null
          break
      }
    }
  }

  return result
}
