import { Card, CardContent } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { BreakdownRow, CountRow } from '@/lib/outreach/results'

export function percent(value: number | null): string {
  if (value === null) return '–'
  const shown = value * 100
  return `${shown >= 10 || shown === 0 ? Math.round(shown) : shown.toFixed(1)}%`
}

export function StatTile({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <Card className="gap-1 py-4">
      <CardContent className="px-4">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="mt-1 text-3xl font-semibold tabular-nums">{value}</p>
        <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
      </CardContent>
    </Card>
  )
}

// One hue, largest first, each bar named and numbered in text
export function BarList({ rows, emptyText }: { rows: CountRow[]; emptyText: string }) {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">{emptyText}</p>

  const total = rows.reduce((sum, row) => sum + row.count, 0)
  const largest = Math.max(...rows.map((row) => row.count))

  return (
    <ul className="space-y-2.5">
      {rows.map((row) => (
        <li key={row.key} title={`${row.label}: ${row.count} of ${total}`}>
          <div className="flex items-baseline justify-between gap-2 text-sm">
            <span>{row.label}</span>
            <span className="tabular-nums text-muted-foreground">{row.count}</span>
          </div>
          <div className="mt-1 h-2 rounded-r bg-muted">
            <div
              className="h-2 rounded-r bg-[var(--chart-2)]"
              style={{ width: `${(row.count / largest) * 100}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  )
}

export function BreakdownTable({ heading, rows }: { heading: string; rows: BreakdownRow[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{heading}</TableHead>
          <TableHead className="text-right">Emailed</TableHead>
          <TableHead className="text-right">Replies</TableHead>
          <TableHead className="text-right">Reply rate</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.key}>
            <TableCell className="whitespace-normal">{row.label}</TableCell>
            <TableCell className="text-right tabular-nums">{row.emailed}</TableCell>
            <TableCell className="text-right tabular-nums">{row.replied}</TableCell>
            <TableCell className="text-right tabular-nums">{percent(row.replyRate)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
