'use client'

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { AlertCircle, CheckCircle2 } from 'lucide-react'
import type { ParsedRow, ColumnMapping } from '@/lib/import/types'

interface ImportPreviewTableProps {
  rows: ParsedRow[]
  mappings: ColumnMapping[]
  maxRows?: number
}

export function ImportPreviewTable({ rows, mappings, maxRows = 10 }: ImportPreviewTableProps) {
  const activeMappings = mappings.filter(m => m.targetField)
  const displayRows = rows.slice(0, maxRows)
  const validCount = rows.filter(r => r.isValid).length
  const invalidCount = rows.filter(r => !r.isValid).length

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Showing {displayRows.length} of {rows.length} rows
        </p>
        <div className="flex gap-4 text-sm">
          <span className="flex items-center gap-1 text-green-600">
            <CheckCircle2 className="h-4 w-4" />
            {validCount} valid
          </span>
          {invalidCount > 0 && (
            <span className="flex items-center gap-1 text-destructive">
              <AlertCircle className="h-4 w-4" />
              {invalidCount} invalid
            </span>
          )}
        </div>
      </div>

      <div className="rounded-md border overflow-auto max-h-64">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">Status</TableHead>
              {activeMappings.map(m => (
                <TableHead key={m.sourceColumn} className="min-w-32">
                  {m.targetField}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {displayRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={activeMappings.length + 1} className="text-center text-muted-foreground">
                  No data to preview
                </TableCell>
              </TableRow>
            ) : (
              displayRows.map((row) => (
                <TableRow key={row.rowIndex} className={!row.isValid ? 'bg-destructive/10' : ''}>
                  <TableCell>
                    {row.isValid ? (
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
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {invalidCount > 0 && (
        <div className="text-sm text-muted-foreground">
          Invalid rows will be skipped during import.
        </div>
      )}
    </div>
  )
}
