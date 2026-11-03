// Reads a recording in any supported format (.lvm, .csv, .xlsx), chosen from the file extension.
import { parseCsv } from './csv.ts'
import { parseLvm } from './lvm.ts'
import type { ParsedSignal } from './parsedSignal.ts'
import { parseXlsx } from './xlsx.ts'

/**
 * `column` is the spreadsheet letter of the signal in a multi-channel .lvm file (e.g. "D"), or null.
 * CSV and XLSX files hold one signal only, so they take no column.
 */
export async function parseRecording(
  fileName: string,
  data: ArrayBuffer,
  column: string | null = null,
): Promise<ParsedSignal> {
  const extension = fileName.slice(fileName.lastIndexOf('.') + 1).toLowerCase()
  // LVM and CSV are text; XLSX is a binary (zip) file, so SheetJS needs the raw bytes.
  if (extension === 'lvm') return parseLvm(new TextDecoder().decode(data), column)
  if (column !== null && (extension === 'csv' || extension === 'xlsx')) {
    throw new Error(`A column can be chosen only in .lvm files, not in "${fileName}"`)
  }
  if (extension === 'csv') return parseCsv(new TextDecoder().decode(data))
  if (extension === 'xlsx') return parseXlsx(data)
  throw new Error(`Unsupported file "${fileName}": use .lvm, .csv or .xlsx`)
}
