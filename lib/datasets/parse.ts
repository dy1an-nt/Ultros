import Papa from "papaparse"

export const MAX_ROWS = 500
export const MAX_COLUMNS = 20
export const MAX_COLUMN_NAME_LENGTH = 50
export const RESERVED_COLUMN = "expectedOutput"

const COLUMN_NAME_RE = /^[a-zA-Z0-9_ -]+$/

export type ParsedRow = { data: Record<string, string>; expectedOutput: string | null }
export type ParseResult =
  | { columns: string[]; rows: ParsedRow[]; error: null }
  | { columns: null; rows: null; error: string }

function fail(error: string): ParseResult {
  return { columns: null, rows: null, error }
}

function validateColumns(names: string[]): string | null {
  if (names.length === 0) return "dataset has no columns"
  // expectedOutput is split out of data, so the cap applies to real columns
  const dataColumns = names.filter((n) => n !== RESERVED_COLUMN)
  if (dataColumns.length === 0) return "dataset needs at least one column besides expectedOutput"
  if (dataColumns.length > MAX_COLUMNS) return `too many columns (max ${MAX_COLUMNS})`
  const seen = new Set<string>()
  for (const name of names) {
    if (name.length < 1 || name.length > MAX_COLUMN_NAME_LENGTH) {
      return `column "${name.slice(0, 60)}": name must be 1–${MAX_COLUMN_NAME_LENGTH} chars`
    }
    if (!COLUMN_NAME_RE.test(name)) {
      return `column "${name}": only letters, digits, underscore, space, and hyphen allowed`
    }
    if (seen.has(name)) return `duplicate column name "${name}"`
    seen.add(name)
  }
  return null
}

function toRows(columns: string[], records: Record<string, unknown>[]): ParseResult {
  if (records.length === 0) return fail("dataset has no rows")
  if (records.length > MAX_ROWS) return fail(`too many rows (max ${MAX_ROWS}, got ${records.length})`)

  const dataColumns = columns.filter((c) => c !== RESERVED_COLUMN)
  const rows: ParsedRow[] = records.map((record) => {
    const data: Record<string, string> = {}
    for (const col of dataColumns) {
      const value = record[col]
      data[col] = value === null || value === undefined ? "" : String(value)
    }
    const expected = record[RESERVED_COLUMN]
    return {
      data,
      expectedOutput: expected === null || expected === undefined || expected === "" ? null : String(expected),
    }
  })
  return { columns: dataColumns, rows, error: null }
}

export function parseCsv(csvText: string): ParseResult {
  const parsed = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
  })
  // Papaparse renames duplicate headers (a → a_1) instead of erroring,
  // surface that as the validation failure it is.
  const renamed = parsed.meta.renamedHeaders
  if (renamed && Object.keys(renamed).length > 0) {
    return fail(`duplicate column name "${Object.values(renamed)[0]}"`)
  }
  // Single-column CSVs have no delimiter to detect; papaparse defaults to
  // comma and parses fine. That "error" is not a failure.
  const errors = parsed.errors.filter((e) => e.code !== "UndetectableDelimiter")
  // Papaparse reports recoverable errors (e.g. field count mismatch) per row.
  const rowError = errors.find((e) => e.row !== undefined)
  if (rowError) return fail(`row ${(rowError.row ?? 0) + 1}: ${rowError.message}`)
  if (errors.length > 0) return fail(errors[0].message)

  const columns = parsed.meta.fields ?? []
  const columnError = validateColumns(columns)
  if (columnError) return fail(columnError)

  return toRows(columns, parsed.data)
}

export function parseJsonRows(rows: unknown): ParseResult {
  if (!Array.isArray(rows)) return fail("rows must be an array of objects")
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    if (typeof row !== "object" || row === null || Array.isArray(row)) {
      return fail(`row ${i + 1}: must be an object`)
    }
    for (const value of Object.values(row)) {
      if (value !== null && typeof value === "object") {
        return fail(`row ${i + 1}: nested objects are not allowed. Cells must be scalar`)
      }
    }
  }
  const records = rows as Record<string, unknown>[]
  if (records.length === 0) return fail("dataset has no rows")

  // Column set = union of keys, in first-seen order; missing cells become ""
  const columns: string[] = []
  const seen = new Set<string>()
  for (const record of records) {
    for (const key of Object.keys(record)) {
      if (!seen.has(key)) {
        seen.add(key)
        columns.push(key)
      }
    }
  }
  const columnError = validateColumns(columns)
  if (columnError) return fail(columnError)

  return toRows(columns, records)
}
