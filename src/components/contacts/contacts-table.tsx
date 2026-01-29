'use client'

import { useState, useMemo } from 'react'
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type SortingState,
  type ColumnFiltersState,
  flexRender,
} from '@tanstack/react-table'
import { Search, Plus, X } from 'lucide-react'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useLeads, useDeleteLead } from '@/lib/queries/leads'
import { useStages } from '@/lib/queries/stages'
import { createColumns } from './columns'
import { LeadSheet } from '@/components/leads/lead-sheet'
import { LeadFormDialog } from '@/components/leads/lead-form-dialog'
import type { Lead } from '@/types/database'

export function ContactsTable() {
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const [globalFilter, setGlobalFilter] = useState('')
  const [selectedStageIds, setSelectedStageIds] = useState<string[]>([])

  const [selectedLead, setSelectedLead] = useState<Lead | null>(null)
  const [isSheetOpen, setIsSheetOpen] = useState(false)
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<Lead | null>(null)

  const { data: leads = [], isLoading: leadsLoading } = useLeads()
  const { data: stages = [], isLoading: stagesLoading } = useStages()
  const deleteLead = useDeleteLead()

  const handleView = (lead: Lead) => {
    setSelectedLead(lead)
    setIsSheetOpen(true)
  }

  const handleDelete = async () => {
    if (!deleteConfirm) return
    try {
      await deleteLead.mutateAsync(deleteConfirm.id)
      toast.success('Lead deleted successfully')
      setDeleteConfirm(null)
    } catch {
      toast.error('Failed to delete lead')
    }
  }

  const toggleStageFilter = (stageId: string) => {
    setSelectedStageIds((prev) =>
      prev.includes(stageId)
        ? prev.filter((id) => id !== stageId)
        : [...prev, stageId]
    )
  }

  const columns = useMemo(
    () =>
      createColumns({
        stages,
        onView: handleView,
        onDelete: setDeleteConfirm,
      }),
    [stages]
  )

  const filteredLeads = useMemo(() => {
    if (selectedStageIds.length === 0) return leads
    return leads.filter((lead) => selectedStageIds.includes(lead.stage_id))
  }, [leads, selectedStageIds])

  const table = useReactTable({
    data: filteredLeads,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn: 'includesString',
    state: {
      sorting,
      columnFilters,
      globalFilter,
    },
    initialState: {
      pagination: {
        pageSize: 20,
      },
    },
  })

  if (leadsLoading || stagesLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Loading contacts...</div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <div className="relative flex-1 sm:w-64">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search contacts..."
              value={globalFilter}
              onChange={(e) => setGlobalFilter(e.target.value)}
              className="pl-8"
            />
          </div>
        </div>

        <Button onClick={() => setIsAddDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Add Lead
        </Button>
      </div>

      {/* Stage filters */}
      <div className="flex flex-wrap gap-2">
        {stages.map((stage) => {
          const isSelected = selectedStageIds.includes(stage.id)
          return (
            <Badge
              key={stage.id}
              variant={isSelected ? 'default' : 'outline'}
              className="cursor-pointer transition-colors"
              style={
                isSelected
                  ? { backgroundColor: stage.color, color: 'white' }
                  : undefined
              }
              onClick={() => toggleStageFilter(stage.id)}
            >
              {stage.name}
              {isSelected && <X className="ml-1 h-3 w-3" />}
            </Badge>
          )
        })}
        {selectedStageIds.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelectedStageIds([])}
            className="h-6 px-2 text-xs"
          >
            Clear filters
          </Button>
        )}
      </div>

      {/* Table */}
      <div className="rounded-md border bg-white dark:bg-gray-950">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && 'selected'}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center"
                >
                  No contacts found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          Showing {table.getRowModel().rows.length} of {filteredLeads.length}{' '}
          contacts
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            Next
          </Button>
        </div>
      </div>

      {/* Lead Sheet */}
      <LeadSheet
        lead={selectedLead}
        open={isSheetOpen}
        onOpenChange={setIsSheetOpen}
      />

      {/* Add Lead Dialog */}
      <LeadFormDialog
        open={isAddDialogOpen}
        onOpenChange={setIsAddDialogOpen}
        stageId={stages[0]?.id || null}
      />

      {/* Delete Confirmation */}
      <AlertDialog
        open={!!deleteConfirm}
        onOpenChange={(open) => !open && setDeleteConfirm(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Lead</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {deleteConfirm?.contact_name}?
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
