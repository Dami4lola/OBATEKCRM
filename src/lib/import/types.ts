export interface ParsedRow {
  rowIndex: number
  data: Record<string, string | number | null>
  errors: string[]
  isValid: boolean
}

export interface ParseResult {
  headers: string[]
  rows: ParsedRow[]
  totalRows: number
  validRows: number
  invalidRows: number
}

export interface ColumnMapping {
  sourceColumn: string
  targetField: keyof LeadImportFields | null
}

export interface LeadImportFields {
  contact_name: string
  company_name: string | null
  email: string | null
  phone: string | null
  value: number | null
  payment_terms: 'one_time' | 'monthly' | 'hourly' | null
  notes: string | null
}

export type FileType = 'csv' | 'xlsx' | 'xls' | 'json'
