// Reads a recording in any supported format (.lvm, .csv, .xlsx), chosen from the file extension.
import { parseCsv } from './csv.ts'
import { parseLvm } from './lvm.ts'
import type { ParsedSignal } from './parsedSignal.ts'
import { parseXlsx } from './xlsx.ts'

export async function parseRecording(fileName: string, data: ArrayBuffer): Promise<ParsedSignal> {
  const extension = fileName.slice(fileName.lastIndexOf('.') + 1).toLowerCase()
  // LVM and CSV are text; XLSX is a binary (zip) file, so SheetJS needs the raw bytes.
  if (extension === 'lvm') return parseLvm(new TextDecoder().decode(data))
  if (extension === 'csv') return parseCsv(new TextDecoder().decode(data))
  if (extension === 'xlsx') return parseXlsx(data)
  throw new Error(`Unsupported file "${fileName}": use .lvm, .csv or .xlsx`)
}
