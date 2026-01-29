'use client'

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { ArrowRight } from 'lucide-react'
import type { ColumnMapping, LeadImportFields } from '@/lib/import/types'

const TARGET_FIELDS: { value: keyof LeadImportFields | 'skip'; label: string }[] = [
  { value: 'skip', label: 'Skip this column' },
  { value: 'contact_name', label: 'Contact Name (required)' },
  { value: 'company_name', label: 'Company Name' },
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Phone' },
  { value: 'value', label: 'Deal Value' },
  { value: 'notes', label: 'Notes' },
]

interface ImportColumnMapperProps {
  mappings: ColumnMapping[]
  onMappingChange: (mappings: ColumnMapping[]) => void
}

export function ImportColumnMapper({ mappings, onMappingChange }: ImportColumnMapperProps) {
  const handleChange = (index: number, value: string) => {
    const newMappings = [...mappings]
    newMappings[index] = {
      ...newMappings[index],
      targetField: value === 'skip' ? null : value as keyof LeadImportFields,
    }
    onMappingChange(newMappings)
  }

  const hasContactName = mappings.some(m => m.targetField === 'contact_name')

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Map your file columns to lead fields. At minimum, <strong>Contact Name</strong> is required.
      </p>

      {!hasContactName && (
        <div className="p-3 text-sm text-amber-700 bg-amber-50 dark:bg-amber-950 dark:text-amber-300 rounded-md">
          Please map at least one column to Contact Name
        </div>
      )}

      <div className="grid gap-3 max-h-64 overflow-y-auto pr-2">
        {mappings.map((mapping, index) => (
          <div key={mapping.sourceColumn} className="flex items-center gap-3">
            <Label className="w-1/3 truncate text-sm font-medium bg-gray-50 dark:bg-gray-800 px-3 py-2 rounded">
              {mapping.sourceColumn}
            </Label>
            <ArrowRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <Select
              value={mapping.targetField || 'skip'}
              onValueChange={(value) => handleChange(index, value)}
            >
              <SelectTrigger className="w-1/2">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TARGET_FIELDS.map((field) => (
                  <SelectItem key={field.value} value={field.value}>
                    {field.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ))}
      </div>
    </div>
  )
}
