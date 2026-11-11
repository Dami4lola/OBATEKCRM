import { buildFalseData, type Row, type Tables } from './false-data'

// The demo's data, in memory. A refresh rebuilds it, which is the reset.

let tables: Tables | null = null

export function allTables(): Tables {
  tables ??= buildFalseData(new Date())
  return tables
}

export function rowsOf(table: string): Row[] {
  const rows = allTables()[table]
  if (!rows) throw new Error(`The demo has no table "${table}"`)
  return rows
}

export function newId(): string {
  const hex = () => Math.floor(Math.random() * 0x10000).toString(16).padStart(4, '0')
  return `${hex()}${hex()}-${hex()}-4${hex().slice(1)}-a${hex().slice(1)}-${hex()}${hex()}${hex()}`
}
