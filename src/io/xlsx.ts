// Parser for Excel recordings: first sheet, column 1 = time (s), column 2 = value (V) (format: docs/data-formats.md).
import type { ParsedSignal } from './parsedSignal.ts'
import { sampleRateFromTimes } from './sampleRate.ts'

export async function parseXlsx(data: ArrayBuffer): Promise<ParsedSignal> {
  // SheetJS is large: it is downloaded only when an .xlsx file is opened, not when the app loads.
  const XLSX = await import('xlsx')

  const workbook = XLSX.read(data, { type: 'array' })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  if (sheet === undefined) throw new Error('The Excel file has no sheets')

  // One array of cells per row. Blank rows are kept so that rows[i] is always Excel row firstRow + i,
  // which makes the row numbers in the error messages correct.
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: true })
  const firstRow = XLSX.utils.decode_range(sheet['!ref'] ?? 'A1').s.r + 1

  // The header ("Time (s)", "Voltage (V)") is the first non-empty row, when its first cell is not a number.
  let firstDataRow = rows.findIndex((row) => !isEmptyRow(row))
  if (firstDataRow === -1) throw new Error('The first sheet of the Excel file is empty')
  if (typeof rows[firstDataRow][0] !== 'number') firstDataRow++

  // First pass: count the rows, so the Float32Array is allocated once with the right size.
  let count = 0
  for (let i = firstDataRow; i < rows.length; i++) {
    if (!isEmptyRow(rows[i])) count++
  }

  const samples = new Float32Array(count)
  let firstTime = NaN
  let lastTime = NaN
  let n = 0
  for (let i = firstDataRow; i < rows.length; i++) {
    const row = rows[i]
    if (isEmptyRow(row)) continue
    const [time, value] = row
    // A third column would be another signal (e.g. SCG X/Y/Z): fail instead of reading only the first one.
    const hasExtraColumns = row.slice(2).some((cell) => !isEmptyCell(cell))
    if (typeof time !== 'number' || typeof value !== 'number' || hasExtraColumns) {
      throw new Error(
        `XLSX row ${firstRow + i}: expected 2 numbers (time in s, value in V), got ${JSON.stringify(row)}`,
      )
    }
    if (n === 0) firstTime = time
    lastTime = time
    samples[n++] = value
  }

  return { fs: sampleRateFromTimes(count, firstTime, lastTime), samples }
}

function isEmptyCell(cell: unknown): boolean {
  return cell === undefined || cell === null || cell === ''
}

// Array.every() skips the holes of sparse arrays, so a row of missing cells counts as empty too.
function isEmptyRow(row: unknown[]): boolean {
  return row.every(isEmptyCell)
}
