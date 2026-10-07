'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { CalendarDays, Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useMeetings } from '@/lib/queries/meetings'
import { MEETING_ROLES } from '@/lib/validations/meeting'
import { MeetingTile } from './meeting-tile'
import { MeetingFormDialog } from './meeting-form-dialog'
import type { MeetingWithLead } from '@/types/database'

const ALL = 'all'
const NO_COMPANY = '__none__'

type SortOption = 'newest' | 'oldest' | 'name' | 'company'

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'name', label: 'Name (A–Z)' },
  { value: 'company', label: 'Company (A–Z)' },
]

function uniqueSorted(values: (string | null | undefined)[]) {
  return Array.from(
    new Set(values.filter((v): v is string => !!v && v.trim() !== ''))
  ).sort((a, b) => a.localeCompare(b))
}

export function MeetingsBoard() {
  const { data: meetings = [], isLoading } = useMeetings()
  const [search, setSearch] = useState('')
  const [company, setCompany] = useState(ALL)
  const [role, setRole] = useState(ALL)
  const [field, setField] = useState(ALL)
  const [sort, setSort] = useState<SortOption>('newest')
  const [selectedMeeting, setSelectedMeeting] = useState<MeetingWithLead | null>(
    null
  )

  const companies = useMemo(
    () => uniqueSorted(meetings.map((m) => m.leads?.company_name)),
    [meetings]
  )
  const hasNoCompany = meetings.some((m) => !m.leads?.company_name)
  const fields = useMemo(
    () => uniqueSorted(meetings.map((m) => m.field_of_work)),
    [meetings]
  )

  const filteredMeetings = useMemo(() => {
    const query = search.trim().toLowerCase()

    const result = meetings.filter((m) => {
      const companyName = m.leads?.company_name || ''
      if (company === NO_COMPANY && companyName) return false
      if (company !== ALL && company !== NO_COMPANY && companyName !== company)
        return false
      if (role !== ALL && m.attendee_role !== role) return false
      if (field !== ALL && m.field_of_work !== field) return false
      if (query) {
        const haystack = [
          m.attendee_name,
          m.leads?.contact_name,
          m.title,
          companyName,
          m.field_of_work,
        ]
          .join(' ')
          .toLowerCase()
        if (!haystack.includes(query)) return false
      }
      return true
    })

    return result.sort((a, b) => {
      switch (sort) {
        case 'oldest':
          return a.meeting_date.localeCompare(b.meeting_date)
        case 'name':
          return a.attendee_name.localeCompare(b.attendee_name)
        case 'company':
          return (a.leads?.company_name || '').localeCompare(
            b.leads?.company_name || ''
          )
        default:
          return b.meeting_date.localeCompare(a.meeting_date)
      }
    })
  }, [meetings, search, company, role, field, sort])

  const hasFilters =
    search !== '' || company !== ALL || role !== ALL || field !== ALL

  const clearFilters = () => {
    setSearch('')
    setCompany(ALL)
    setRole(ALL)
    setField(ALL)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Loading meetings...</div>
      </div>
    )
  }

  if (meetings.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 rounded-md border border-dashed bg-white dark:bg-gray-950 text-center">
        <CalendarDays className="h-10 w-10 text-muted-foreground mb-3" />
        <p className="font-medium">No meetings logged yet</p>
        <p className="text-sm text-muted-foreground mb-4">
          Open a lead on the pipeline and click &quot;Log meeting&quot;.
        </p>
        <Button asChild variant="outline">
          <Link href="/">Go to Pipeline</Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col gap-2 lg:flex-row lg:flex-wrap lg:items-center">
        <div className="relative lg:w-64">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, company..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>

        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
          <Select value={company} onValueChange={setCompany}>
            <SelectTrigger className="w-full sm:w-44">
              <SelectValue placeholder="Company" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All companies</SelectItem>
              {companies.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
              {hasNoCompany && (
                <SelectItem value={NO_COMPANY}>No company</SelectItem>
              )}
            </SelectContent>
          </Select>

          <Select value={role} onValueChange={setRole}>
            <SelectTrigger className="w-full sm:w-40">
              <SelectValue placeholder="Role" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All roles</SelectItem>
              {MEETING_ROLES.map((r) => (
                <SelectItem key={r.value} value={r.value}>
                  {r.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={field} onValueChange={setField}>
            <SelectTrigger className="w-full sm:w-44">
              <SelectValue placeholder="Field of work" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All fields</SelectItem>
              {fields.map((f) => (
                <SelectItem key={f} value={f}>
                  {f}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={sort} onValueChange={(v) => setSort(v as SortOption)}>
            <SelectTrigger className="w-full sm:w-40">
              <SelectValue placeholder="Sort" />
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearFilters}
            className="w-fit text-xs"
          >
            Clear filters
          </Button>
        )}
      </div>

      <p className="text-sm text-muted-foreground">
        {filteredMeetings.length} of {meetings.length} meeting
        {meetings.length === 1 ? '' : 's'}
      </p>

      {/* Tiles */}
      {filteredMeetings.length === 0 ? (
        <div className="flex items-center justify-center h-40 rounded-md border border-dashed text-sm text-muted-foreground">
          No meetings match these filters.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredMeetings.map((meeting) => (
            <MeetingTile
              key={meeting.id}
              meeting={meeting}
              onClick={() => setSelectedMeeting(meeting)}
            />
          ))}
        </div>
      )}

      <MeetingFormDialog
        open={!!selectedMeeting}
        onOpenChange={(open) => !open && setSelectedMeeting(null)}
        lead={selectedMeeting?.leads ?? null}
        meeting={selectedMeeting}
      />
    </div>
  )
}
