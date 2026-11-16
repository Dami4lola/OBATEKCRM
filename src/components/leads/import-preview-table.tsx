'use client'

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Checkbox } from '@/components/ui/checkbox'
import { AlertCircle, CheckCircle2, Copy } from 'lucide-react'
import { DUPLICATE_REASONS } from '@/lib/import/duplicates'
import type { ParsedRow, ColumnMapping } from '@/lib/import/types'

interface ImportPreviewTableProps {
  rows: ParsedRow[]
  mappings: ColumnMapping[]
  // Row indexes ticked "CASL basis confirmed"
  caslTicked: Set<number>
  onToggleCasl: (rowIndex: number, checked: boolean) => void
  onToggleCaslAll: (checked: boolean) => void
}

// Every row is shown (the table scrolls), so any row can be unticked
export function ImportPreviewTable({
  rows,
  mappings,
  caslTicked,
  onToggleCasl,
  onToggleCaslAll,
}: ImportPreviewTableProps) {
  const activeMappings = mappings.filter(m => m.targetField)
  const importable = rows.filter(r => r.isValid && !r.duplicate)
  const validCount = importable.length
  const duplicateCount = rows.filter(r => r.duplicate).length
  const invalidCount = rows.filter(r => !r.isValid).length
  const allTicked = validCount > 0 && importable.every(r => caslTicked.has(r.rowIndex))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {rows.length} row{rows.length !== 1 ? 's' : ''}
        </p>
        <div className="flex flex-wrap gap-4 text-sm">
          <span className="flex items-center gap-1 text-green-600">
            <CheckCircle2 className="h-4 w-4" />
            {validCount} valid
          </span>
          {duplicateCount > 0 && (
            <span className="flex items-center gap-1 text-amber-600">
              <Copy className="h-4 w-4" />
              {duplicateCount} duplicate{duplicateCount !== 1 ? 's' : ''}
            </span>
          )}
          {invalidCount > 0 && (
            <span className="flex items-center gap-1 text-destructive">
              <AlertCircle className="h-4 w-4" />
              {invalidCount} invalid
            </span>
          )}
        </div>
      </div>

      <div className="rounded-md border overflow-auto max-h-80">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-20">
                <label className="flex items-center gap-1.5" title="CASL basis confirmed">
                  <Checkbox
                    checked={allTicked}
                    disabled={validCount === 0}
                    onCheckedChange={(checked) => onToggleCaslAll(checked === true)}
                    aria-label="CASL basis confirmed for every row"
                  />
                  CASL
                </label>
              </TableHead>
              <TableHead className="w-16">Status</TableHead>
              {activeMappings.map(m => (
                <TableHead key={m.sourceColumn} className="min-w-32">
                  {m.targetField}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={activeMappings.length + 2} className="text-center text-muted-foreground">
                  No data to preview
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => {
                const importableRow = row.isValid && !row.duplicate
                return (
                  <TableRow
                    key={row.rowIndex}
                    className={!row.isValid ? 'bg-destructive/10' : row.duplicate ? 'bg-amber-50 dark:bg-amber-950/30' : ''}
                  >
                    <TableCell>
                      <Checkbox
                        checked={importableRow && caslTicked.has(row.rowIndex)}
                        disabled={!importableRow}
                        onCheckedChange={(checked) => onToggleCasl(row.rowIndex, checked === true)}
                        aria-label={`CASL basis confirmed for row ${row.rowIndex + 1}`}
                      />
                    </TableCell>
                    <TableCell>
                      {row.isValid && row.duplicate ? (
                        <div className="group relative">
                          <Copy className="h-4 w-4 text-amber-600" />
                          <div className="absolute left-6 top-0 z-10 hidden group-hover:block bg-popover border rounded-md p-2 text-xs shadow-lg max-w-64 whitespace-nowrap">
                            <p>{DUPLICATE_REASONS[row.duplicate]}</p>
                          </div>
                        </div>
                      ) : row.isValid ? (
                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                      ) : (
                        <div className="group relative">
                          <AlertCircle className="h-4 w-4 text-destructive" />
                          {row.errors.length > 0 && (
                            <div className="absolute left-6 top-0 z-10 hidden group-hover:block bg-popover border rounded-md p-2 text-xs shadow-lg max-w-64">
                              {row.errors.map((err, i) => (
                                <p key={i} className="text-destructive">{err}</p>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </TableCell>
                    {activeMappings.map(m => (
                      <TableCell key={m.sourceColumn} className="max-w-32 truncate">
                        {String(row.data[m.targetField!] ?? row.data[m.sourceColumn] ?? '')}
                      </TableCell>
                    ))}
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>

      {(invalidCount > 0 || duplicateCount > 0) && (
        <div className="text-sm text-muted-foreground">
          {invalidCount > 0 && duplicateCount > 0
            ? 'Invalid rows and duplicates will be skipped during import.'
            : invalidCount > 0
              ? 'Invalid rows will be skipped during import.'
              : 'Duplicates will be skipped during import.'}
        </div>
      )}
    </div>
  )
}
