'use client'

import { useState, useCallback } from 'react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Loader2 } from 'lucide-react'
import { ImportFileUpload } from './import-file-upload'
import { ImportColumnMapper } from './import-column-mapper'
import { ImportPreviewTable } from './import-preview-table'
import { parseFile } from '@/lib/import/parsers'
import { autoMapColumns, applyMapping } from '@/lib/import/column-mapper'
import { validateImportRow } from '@/lib/validations/import'
import { fetchLeadKeys, useBulkCreateLeads } from '@/lib/queries/leads'
import { markDuplicates } from '@/lib/import/duplicates'
import { contactNameFor, MIN_CONTACT_FIELDS } from '@/lib/import/contact-rule'
import { useStages } from '@/lib/queries/stages'
import { EMAIL_SOURCES } from '@/lib/validations/lead'
import type { ParseResult, ColumnMapping, ParsedRow, LeadImportFields } from '@/lib/import/types'
import type { EmailSource } from '@/types/database'

type Step = 'upload' | 'map' | 'preview'

interface ImportLeadsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ImportLeadsDialog({ open, onOpenChange }: ImportLeadsDialogProps) {
  const [step, setStep] = useState<Step>('upload')
  const [parseResult, setParseResult] = useState<ParseResult | null>(null)
  const [mappings, setMappings] = useState<ColumnMapping[]>([])
  const [validatedRows, setValidatedRows] = useState<ParsedRow[]>([])
  const [selectedStageId, setSelectedStageId] = useState<string>('')
  const [emailSource, setEmailSource] = useState<EmailSource | ''>('')
  const [isLoading, setIsLoading] = useState(false)

  const { data: stages = [] } = useStages()
  const bulkCreate = useBulkCreateLeads()

  const handleFileSelect = useCallback(async (file: File) => {
    setIsLoading(true)
    try {
      const result = await parseFile(file)
      if (result.rows.length === 0) {
        toast.error('The file is empty or has no data rows')
        return
      }
      setParseResult(result)
      setMappings(autoMapColumns(result.headers))
      setStep('map')
    } catch (error) {
      toast.error('Failed to parse file. Please check the format.')
      console.error('Parse error:', error)
    } finally {
      setIsLoading(false)
    }
  }, [])

  const handleMappingConfirm = useCallback(async () => {
    if (!parseResult) return

    const mapped = ['contact_name', 'email', 'company_name'].filter(field => mappings.some(m => m.targetField === field))
    if (mapped.length < MIN_CONTACT_FIELDS) {
      toast.error('Map columns to at least two of Contact Name, Email and Company')
      return
    }

    // Validate all rows with the current mappings
    const validated = parseResult.rows.map(row => {
      const mappedData = applyMapping(row.data, mappings)
      const validation = validateImportRow(mappedData)
      return {
        ...row,
        data: mappedData as Record<string, string | number | null>,
        isValid: validation.valid,
        errors: validation.errors,
      }
    })

    // Rows that repeat a lead you have, or an earlier row, are marked and left out
    setIsLoading(true)
    try {
      setValidatedRows(markDuplicates(validated, await fetchLeadKeys()))
      setStep('preview')
    } catch (error) {
      toast.error('Could not check for duplicates, so nothing was imported')
      console.error('Duplicate check error:', error)
    } finally {
      setIsLoading(false)
    }
  }, [parseResult, mappings])

  const handleImport = useCallback(async () => {
    if (!selectedStageId) {
      toast.error('Please select a stage')
      return
    }

    // Checked again now: leads may have been added since the preview
    let checked: ParsedRow[]
    try {
      checked = markDuplicates(validatedRows, await fetchLeadKeys())
    } catch (error) {
      toast.error('Could not check for duplicates, so nothing was imported')
      console.error('Duplicate check error:', error)
      return
    }
    const skipped = checked.filter(row => row.duplicate).length

    const validLeads = checked
      .filter(row => row.isValid && !row.duplicate)
      .map(row => {
        const data = row.data as Partial<LeadImportFields>
        return {
          contact_name: contactNameFor(data),
          company_name: data.company_name ?? null,
          email: data.email ?? null,
          phone: data.phone ?? null,
          value: data.value ?? null,
          payment_terms: data.payment_terms ?? null,
          notes: data.notes ?? null,
          job_title: data.job_title ?? null,
          website: data.website ?? null,
          city: data.city ?? null,
          region: data.region ?? null,
          country: data.country ?? null,
          vertical: data.vertical ?? null,
          staff_size: data.staff_size ?? null,
          linkedin_url: data.linkedin_url ?? null,
          email_source: data.email ? emailSource || null : null,
        }
      })

    if (validLeads.length === 0) {
      setValidatedRows(checked)
      toast.error(skipped > 0 ? `Nothing to import: all ${skipped} were duplicates` : 'No valid leads to import')
      return
    }

    try {
      await bulkCreate.mutateAsync({ stageId: selectedStageId, leads: validLeads })
      toast.success(
        `Imported ${validLeads.length} lead${validLeads.length === 1 ? '' : 's'}` +
          (skipped > 0 ? `, skipped ${skipped} duplicate${skipped === 1 ? '' : 's'}` : '')
      )
      handleClose()
    } catch (error) {
      toast.error('Failed to import leads')
      console.error('Import error:', error)
    }
  }, [selectedStageId, validatedRows, emailSource, bulkCreate])

  const handleClose = useCallback(() => {
    setStep('upload')
    setParseResult(null)
    setMappings([])
    setValidatedRows([])
    setSelectedStageId('')
    setEmailSource('')
    onOpenChange(false)
  }, [onOpenChange])

  const handleBack = useCallback(() => {
    if (step === 'preview') {
      setStep('map')
    } else if (step === 'map') {
      setStep('upload')
      setParseResult(null)
      setMappings([])
    }
  }, [step])

  const validCount = validatedRows.filter(r => r.isValid && !r.duplicate).length

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {step === 'upload' && 'Import Leads'}
            {step === 'map' && 'Map Columns'}
            {step === 'preview' && 'Preview Import'}
          </DialogTitle>
        </DialogHeader>

        <div className="py-4">
          {step === 'upload' && (
            <ImportFileUpload onFileSelect={handleFileSelect} isLoading={isLoading} />
          )}

          {step === 'map' && (
            <ImportColumnMapper mappings={mappings} onMappingChange={setMappings} />
          )}

          {step === 'preview' && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Import to Stage</Label>
                <Select value={selectedStageId} onValueChange={setSelectedStageId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a stage" />
                  </SelectTrigger>
                  <SelectContent>
                    {stages.map(stage => (
                      <SelectItem key={stage.id} value={stage.id}>
                        <div className="flex items-center gap-2">
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: stage.color }}
                          />
                          {stage.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Where did these emails come from?</Label>
                <Select
                  value={emailSource}
                  onValueChange={(val) => setEmailSource(val as EmailSource)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Email source (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    {EMAIL_SOURCES.map(source => (
                      <SelectItem key={source.value} value={source.value}>
                        {source.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Outreach only auto-emails Canadian leads whose email came from their own website (CASL).
                </p>
              </div>
              <ImportPreviewTable rows={validatedRows} mappings={mappings} />
            </div>
          )}
        </div>

        <DialogFooter>
          {step !== 'upload' && (
            <Button variant="outline" onClick={handleBack} disabled={bulkCreate.isPending}>
              Back
            </Button>
          )}
          {step === 'upload' && (
            <Button variant="outline" onClick={handleClose}>
              Cancel
            </Button>
          )}
          {step === 'map' && (
            <Button onClick={handleMappingConfirm} disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Checking for duplicates...
                </>
              ) : (
                'Continue'
              )}
            </Button>
          )}
          {step === 'preview' && (
            <Button
              onClick={handleImport}
              disabled={bulkCreate.isPending || !selectedStageId || validCount === 0}
            >
              {bulkCreate.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Importing...
                </>
              ) : (
                `Import ${validCount} Lead${validCount !== 1 ? 's' : ''}`
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
