import {
  normalizeCountry,
  normalizeVertical,
  parseStaffSize,
} from '@/lib/validations/lead'
import type { ColumnMapping, LeadImportFields } from './types'

// Includes Lusha export headers (First Name, Company Industry, Company Size, ...)
const FIELD_ALIASES: Record<keyof LeadImportFields, string[]> = {
  contact_name: ['name', 'contact', 'contact_name', 'full_name', 'fullname', 'person', 'contactname', 'first_name', 'last_name', 'firstname', 'lastname'],
  company_name: ['company', 'company_name', 'organization', 'org', 'business', 'companyname', 'account_name'],
  email: ['email', 'email_address', 'mail', 'e-mail', 'emailaddress', 'work_email', 'contact_email'],
  phone: ['phone', 'phone_number', 'tel', 'telephone', 'mobile', 'number', 'phonenumber', 'cell', 'direct_phone', 'mobile_phone', 'contact_phone'],
  value: ['value', 'deal_value', 'amount', 'worth', 'price', 'dealvalue'],
  payment_terms: ['payment_terms', 'payment', 'terms', 'billing', 'frequency', 'paymentterms'],
  notes: ['notes', 'note', 'description', 'comments', 'comment', 'remarks'],
  job_title: ['job_title', 'jobtitle', 'title', 'position', 'role'],
  website: ['website', 'company_website', 'company_domain', 'domain', 'web_site', 'website_url', 'homepage'],
  city: ['city', 'town'],
  region: ['region', 'state', 'province', 'state_province'],
  country: ['country', 'country_code'],
  vertical: ['vertical', 'industry', 'company_industry', 'sub_industry', 'trade', 'category'],
  staff_size: ['staff_size', 'company_size', 'employees', 'employee_count', 'number_of_employees', 'headcount', 'staff', 'size'],
  linkedin_url: ['linkedin_url', 'linkedin', 'contact_linkedin', 'linkedin_profile'],
}

// Exact alias matches win; otherwise the longest alias contained in the
// header wins, so "company_name" maps to Company rather than Contact Name.
function scoreAlias(header: string, alias: string): number {
  if (header === alias) return 1000 + alias.length
  if (header.includes(alias)) return alias.length
  if (header.length >= 3 && alias.includes(header)) return header.length
  return 0
}

export function autoMapColumns(headers: string[]): ColumnMapping[] {
  return headers.map((header) => {
    const normalizedHeader = header.toLowerCase().trim().replace(/[\s_-]+/g, '_')

    let bestField: keyof LeadImportFields | null = null
    let bestScore = 0
    for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
      for (const alias of aliases) {
        const score = scoreAlias(normalizedHeader, alias)
        if (score > bestScore) {
          bestScore = score
          bestField = field as keyof LeadImportFields
        }
      }
    }

    return { sourceColumn: header, targetField: bestField }
  })
}

export function applyMapping(
  row: Record<string, string | number | null>,
  mappings: ColumnMapping[]
): Partial<LeadImportFields> {
  const result: Partial<LeadImportFields> = {}

  for (const mapping of mappings) {
    const value = row[mapping.sourceColumn]
    if (mapping.targetField && value != null) {
      const stringValue = String(value).trim() || undefined

      // Several columns may map to one field: names are joined
      // (First Name + Last Name), anything else keeps the first non-empty value
      if (mapping.targetField !== 'contact_name' && result[mapping.targetField] != null) {
        continue
      }

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
          if (stringValue) {
            result.contact_name = result.contact_name
              ? `${result.contact_name} ${stringValue}`
              : stringValue
          }
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
        case 'job_title':
          result.job_title = stringValue ?? null
          break
        case 'website':
          result.website = stringValue ?? null
          break
        case 'city':
          result.city = stringValue ?? null
          break
        case 'region':
          result.region = stringValue ?? null
          break
        case 'country':
          result.country = stringValue ? normalizeCountry(stringValue) : null
          break
        case 'vertical':
          result.vertical = stringValue ? normalizeVertical(stringValue) : null
          break
        case 'staff_size':
          result.staff_size = parseStaffSize(value)
          break
        case 'linkedin_url':
          result.linkedin_url = stringValue
            ? /^https?:\/\//.test(stringValue) ? stringValue : `https://${stringValue}`
            : null
          break
      }
    }
  }

  return result
}
