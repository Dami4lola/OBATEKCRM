import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { installFakeApi } from './fake-api'
import { DEMO_MAILBOX, DEMO_USER, type Row } from './false-data'
import { allTables, newId, rowsOf } from './store'

// Stands in for src/lib/supabase/client.ts in the demo build: the same calls,
// answered from memory in the browser. Changes last until the page refreshes.
// A call this doesn't support throws, so a gap shows up in testing instead of
// as a quietly empty screen.

type Filter = (row: Row) => boolean

interface Embed {
  name: string
  fields: string[] | null
}

interface Shape {
  fields: string[] | null
  embeds: Embed[]
}

interface Result {
  data: unknown
  error: { code?: string; message: string } | null
  count?: number
}

const INSERT_DEFAULTS: Record<string, Row> = {
  leads: { signals: {}, position_index: 0 },
  outreach_emails: { status: 'draft', steps: [], audit: {}, open_count: 0, is_example: false },
  outreach_runs: { summary: {} },
  tasks: { status: 'pending', kind: 'general' },
  copy_feedback: { active: true },
  activities: { meta: {} },
}

// Splits "a, b, leads(c, d)" on the commas outside brackets
function splitColumns(columns: string): string[] {
  const parts: string[] = []
  let depth = 0
  let current = ''
  for (const char of columns) {
    if (char === '(') depth++
    if (char === ')') depth--
    if (char === ',' && depth === 0) {
      parts.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }
  if (current.trim()) parts.push(current.trim())
  return parts
}

function parseShape(columns: string): Shape {
  const shape: Shape = { fields: [], embeds: [] }
  for (const part of splitColumns(columns)) {
    const embed = part.match(/^(\w+)\((.*)\)$/)
    if (embed) {
      const inner = embed[2].trim()
      shape.embeds.push({ name: embed[1], fields: inner === '*' ? null : inner.split(',').map((f) => f.trim()) })
    } else if (part === '*') {
      shape.fields = null
    } else if (/^\w+$/.test(part)) {
      shape.fields?.push(part)
    } else {
      throw new Error(`The demo can't read columns "${part}"`)
    }
  }
  return shape
}

function pick(row: Row, fields: string[] | null): Row {
  return fields ? Object.fromEntries(fields.map((field) => [field, row[field] ?? null])) : { ...row }
}

function applyShape(row: Row, shape: Shape): Row {
  const shaped = pick(row, shape.fields)
  for (const { name, fields } of shape.embeds) {
    // leads(...) follows lead_id, as the real foreign keys do
    const linked = rowsOf(name).find((other) => other.id === row[`${name.replace(/s$/, '')}_id`])
    shaped[name] = linked ? pick(linked, fields) : null
  }
  return shaped
}

function compare(a: unknown, b: unknown): number {
  if (a === b) return 0
  return (a as string) < (b as string) ? -1 : 1
}

class FakeQuery implements PromiseLike<Result> {
  private action: 'select' | 'insert' | 'update' | 'delete' = 'select'
  private shape: Shape | null = null
  private values: Row[] = []
  private filters: Filter[] = []
  private orders: { column: string; ascending: boolean }[] = []
  private window: [number, number] | null = null
  private cap: number | null = null
  private expects: 'many' | 'one' | 'maybe' = 'many'
  private countOnly = false

  constructor(private table: string) {
    if (!(table in allTables())) throw new Error(`The demo has no table "${table}"`)
  }

  select(columns = '*', options?: { count?: string; head?: boolean }) {
    this.shape = parseShape(columns)
    this.countOnly = !!options?.head
    return this
  }

  insert(values: Row | Row[]) {
    this.action = 'insert'
    this.values = Array.isArray(values) ? values : [values]
    return this
  }

  update(values: Row) {
    this.action = 'update'
    this.values = [values]
    return this
  }

  delete() {
    this.action = 'delete'
    return this
  }

  eq(column: string, value: unknown) {
    this.filters.push((row) => row[column] === value)
    return this
  }

  neq(column: string, value: unknown) {
    this.filters.push((row) => row[column] !== value)
    return this
  }

  in(column: string, values: unknown[]) {
    this.filters.push((row) => values.includes(row[column]))
    return this
  }

  gt(column: string, value: unknown) {
    this.filters.push((row) => row[column] != null && compare(row[column], value) > 0)
    return this
  }

  gte(column: string, value: unknown) {
    this.filters.push((row) => row[column] != null && compare(row[column], value) >= 0)
    return this
  }

  lt(column: string, value: unknown) {
    this.filters.push((row) => row[column] != null && compare(row[column], value) < 0)
    return this
  }

  lte(column: string, value: unknown) {
    this.filters.push((row) => row[column] != null && compare(row[column], value) <= 0)
    return this
  }

  is(column: string, value: null) {
    if (value !== null) throw new Error('The demo only supports is(column, null)')
    this.filters.push((row) => row[column] == null)
    return this
  }

  not(column: string, operator: string, value: unknown) {
    if (operator !== 'is' || value !== null) throw new Error(`The demo can't run not(${operator})`)
    this.filters.push((row) => row[column] != null)
    return this
  }

  ilike(column: string, pattern: string) {
    const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*')
    const regex = new RegExp(`^${escaped}$`, 'i')
    this.filters.push((row) => regex.test(String(row[column] ?? '')))
    return this
  }

  order(column: string, options?: { ascending?: boolean }) {
    this.orders.push({ column, ascending: options?.ascending !== false })
    return this
  }

  limit(count: number) {
    this.cap = count
    return this
  }

  range(from: number, to: number) {
    this.window = [from, to]
    return this
  }

  single() {
    this.expects = 'one'
    return this
  }

  maybeSingle() {
    this.expects = 'maybe'
    return this
  }

  then<A = Result, B = never>(
    onDone?: ((value: Result) => A | PromiseLike<A>) | null,
    onFail?: ((reason: unknown) => B | PromiseLike<B>) | null
  ): PromiseLike<A | B> {
    return Promise.resolve()
      .then(() => this.run())
      .then(onDone, onFail)
  }

  private matching(): Row[] {
    return rowsOf(this.table).filter((row) => this.filters.every((filter) => filter(row)))
  }

  private sorted(rows: Row[]): Row[] {
    const sorted = [...rows]
    for (const { column, ascending } of [...this.orders].reverse()) {
      sorted.sort((a, b) => {
        // Postgres puts nulls last going up and first going down
        if (a[column] == null || b[column] == null) {
          if (a[column] == null && b[column] == null) return 0
          return (a[column] == null ? 1 : -1) * (ascending ? 1 : -1)
        }
        return compare(a[column], b[column]) * (ascending ? 1 : -1)
      })
    }
    return sorted
  }

  private write(): Row[] {
    const now = new Date().toISOString()
    const rows = rowsOf(this.table)
    if (this.action === 'insert') {
      const added = this.values.map((values) => ({
        id: newId(),
        created_at: now,
        updated_at: now,
        ...INSERT_DEFAULTS[this.table],
        ...values,
      }))
      rows.push(...added)
      return added
    }
    const chosen = this.matching()
    if (this.action === 'update') {
      for (const row of chosen) Object.assign(row, this.values[0], { updated_at: now })
      return chosen
    }
    const gone = new Set(chosen)
    allTables()[this.table] = rows.filter((row) => !gone.has(row))
    // Deleting a lead takes its history with it, as the real foreign keys do
    if (this.table === 'leads') {
      const ids = new Set(chosen.map((row) => row.id))
      for (const name of ['activities', 'tasks', 'meetings', 'outreach_emails', 'lead_signals']) {
        allTables()[name] = rowsOf(name).filter((row) => !ids.has(row.lead_id))
      }
    }
    return chosen
  }

  private run(): Result {
    let rows = this.action === 'select' ? this.matching() : this.write()
    if (this.action !== 'select' && !this.shape) return { data: null, error: null }

    const count = rows.length
    if (this.countOnly) return { data: null, error: null, count }

    rows = this.sorted(rows)
    if (this.window) rows = rows.slice(this.window[0], this.window[1] + 1)
    if (this.cap !== null) rows = rows.slice(0, this.cap)
    const shape = this.shape ?? { fields: null, embeds: [] }
    const shaped = structuredClone(rows.map((row) => applyShape(row, shape)))

    if (this.expects === 'many') return { data: shaped, error: null, count }
    if (shaped.length > 1 || (this.expects === 'one' && shaped.length === 0)) {
      return { data: null, error: { code: 'PGRST116', message: 'Expected one row' } }
    }
    return { data: shaped[0] ?? null, error: null }
  }
}

function moveLead({ p_lead_id, p_new_stage_id, p_new_position }: Row) {
  const leads = rowsOf('leads')
  const lead = leads.find((row) => row.id === p_lead_id)
  if (!lead) return
  const byPosition = (a: Row, b: Row) => (a.position_index as number) - (b.position_index as number)
  const renumber = (stageId: unknown, list: Row[]) =>
    list.forEach((row, index) => Object.assign(row, { stage_id: stageId, position_index: index }))

  const oldStage = lead.stage_id
  renumber(oldStage, leads.filter((row) => row.stage_id === oldStage && row !== lead).sort(byPosition))
  const target = leads.filter((row) => row.stage_id === p_new_stage_id && row !== lead).sort(byPosition)
  target.splice(p_new_position as number, 0, lead)
  renumber(p_new_stage_id, target)
}

async function rpc(name: string, args: Row = {}): Promise<Result> {
  switch (name) {
    case 'move_lead':
      moveLead(args)
      return { data: null, error: null }
    case 'outreach_mailbox_status':
      return {
        data: [{ address: DEMO_MAILBOX, status: 'connected', connected_at: new Date().toISOString(), inbox_checked_at: new Date().toISOString() }],
        error: null,
      }
    case 'disconnect_outreach_mailbox':
      return { data: null, error: null }
    default:
      throw new Error(`The demo has no function "${name}"`)
  }
}

const client = {
  from: (table: string) => new FakeQuery(table),
  rpc,
  auth: {
    getUser: async () => ({ data: { user: DEMO_USER }, error: null }),
    signOut: async () => ({ error: null }),
  },
}

export function createClient() {
  installFakeApi()
  return client as unknown as SupabaseClient<Database>
}
