import * as XLSX from 'xlsx'
import Papa from 'papaparse'
import type { ParseResult, FileType } from './types'

export function detectFileType(file: File): FileType | null {
  const extension = file.name.split('.').pop()?.toLowerCase()
  if (extension === 'csv') return 'csv'
  if (extension === 'xlsx') return 'xlsx'
  if (extension === 'xls') return 'xls'
  if (extension === 'json') return 'json'
  return null
}

export async function parseFile(file: File): Promise<ParseResult> {
  const fileType = detectFileType(file)
  if (!fileType) throw new Error('Unsupported file type')

  switch (fileType) {
    case 'csv':
      return parseCSV(file)
    case 'xlsx':
    case 'xls':
      return parseExcel(file)
    case 'json':
      return parseJSON(file)
  }
}

async function parseCSV(file: File): Promise<ParseResult> {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const headers = results.meta.fields || []
        const rows = (results.data as Record<string, string>[]).map((row, index) => ({
          rowIndex: index + 1,
          data: row,
          errors: [],
          isValid: true,
        }))
        resolve({
          headers,
          rows,
          totalRows: rows.length,
          validRows: rows.length,
          invalidRows: 0,
        })
      },
      error: (error) => reject(error),
    })
  })
}

async function parseExcel(file: File): Promise<ParseResult> {
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array' })
  const sheetName = workbook.SheetNames[0]
  const sheet = workbook.Sheets[sheetName]
  const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as unknown[][]

  if (jsonData.length === 0) {
    return { headers: [], rows: [], totalRows: 0, validRows: 0, invalidRows: 0 }
  }

  const headers = (jsonData[0] || []).map(String)
  const rows = jsonData.slice(1).map((row, index) => {
    const data: Record<string, string | number | null> = {}
    headers.forEach((header, i) => {
      data[header] = row[i] != null ? row[i] as string | number : null
    })
    return {
      rowIndex: index + 1,
      data,
      errors: [],
      isValid: true,
    }
  })

  return {
    headers,
    rows,
    totalRows: rows.length,
    validRows: rows.length,
    invalidRows: 0,
  }
}

async function parseJSON(file: File): Promise<ParseResult> {
  const text = await file.text()
  const data = JSON.parse(text)
  const array = Array.isArray(data) ? data : [data]

  if (array.length === 0) {
    return { headers: [], rows: [], totalRows: 0, validRows: 0, invalidRows: 0 }
  }

  const headers = Object.keys(array[0])
  const rows = array.map((item, index) => ({
    rowIndex: index + 1,
    data: item as Record<string, string | number | null>,
    errors: [],
    isValid: true,
  }))

  return {
    headers,
    rows,
    totalRows: rows.length,
    validRows: rows.length,
    invalidRows: 0,
  }
}
