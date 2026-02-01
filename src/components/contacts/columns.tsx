'use client'

import { ColumnDef } from '@tanstack/react-table'
import { format } from 'date-fns'
import { ArrowUpDown, MoreHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { Lead, Stage } from '@/types/database'

interface ColumnContext {
  stages: Stage[]
  onView: (lead: Lead) => void
  onDelete: (lead: Lead) => void
}

export const createColumns = ({
  stages,
  onView,
  onDelete,
}: ColumnContext): ColumnDef<Lead>[] => [
  {
    accessorKey: 'contact_name',
    header: ({ column }) => (
      <Button
        variant="ghost"
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        className="h-8 px-2"
      >
        Name
        <ArrowUpDown className="ml-2 h-4 w-4" />
      </Button>
    ),
    cell: ({ row }) => (
      <div className="font-medium">{row.getValue('contact_name')}</div>
    ),
  },
  {
    accessorKey: 'company_name',
    header: 'Company',
    cell: ({ row }) => row.getValue('company_name') || '-',
  },
  {
    accessorKey: 'email',
    header: 'Email',
    cell: ({ row }) => {
      const email = row.getValue('email') as string | null
      return email ? (
        <a href={`mailto:${email}`} className="text-primary hover:underline">
          {email}
        </a>
      ) : (
        '-'
      )
    },
  },
  {
    accessorKey: 'phone',
    header: 'Phone',
    cell: ({ row }) => row.getValue('phone') || '-',
  },
  {
    accessorKey: 'value',
    header: ({ column }) => (
      <Button
        variant="ghost"
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        className="h-8 px-2"
      >
        Value
        <ArrowUpDown className="ml-2 h-4 w-4" />
      </Button>
    ),
    cell: ({ row }) => {
      const value = row.getValue('value') as number | null
      const terms = row.original.payment_terms
      if (!value) return '-'
      const suffix = terms === 'monthly' ? '/mo' : terms === 'hourly' ? '/hr' : ''
      return `$${value.toLocaleString()}${suffix}`
    },
  },
  {
    accessorKey: 'stage_id',
    header: 'Stage',
    cell: ({ row }) => {
      const stageId = row.getValue('stage_id') as string
      const stage = stages.find((s) => s.id === stageId)
      return stage ? (
        <Badge
          style={{ backgroundColor: stage.color }}
          className="text-white"
        >
          {stage.name}
        </Badge>
      ) : (
        '-'
      )
    },
    filterFn: (row, id, value) => {
      return value.includes(row.getValue(id))
    },
  },
  {
    accessorKey: 'created_at',
    header: ({ column }) => (
      <Button
        variant="ghost"
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        className="h-8 px-2"
      >
        Created
        <ArrowUpDown className="ml-2 h-4 w-4" />
      </Button>
    ),
    cell: ({ row }) => {
      const date = row.getValue('created_at') as string
      return format(new Date(date), 'MMM d, yyyy')
    },
  },
  {
    id: 'actions',
    cell: ({ row }) => {
      const lead = row.original

      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreHorizontal className="h-4 w-4" />
              <span className="sr-only">Open menu</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onView(lead)}>
              View Details
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => onDelete(lead)}
              className="text-destructive focus:text-destructive"
            >
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )
    },
  },
]
