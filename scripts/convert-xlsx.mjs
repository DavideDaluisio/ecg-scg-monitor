// Converts a lab .xlsx recording (first sheet: time in s, value in V, one header row)
// into the CSV format used by the replay source (see docs/data-formats.md).
// Usage: node scripts/convert-xlsx.mjs <input.xlsx> <output.csv> <ecg|scg>
import { readFileSync, writeFileSync } from 'node:fs'
import * as XLSX from 'xlsx'

const [input, output, channel] = process.argv.slice(2)
if (!input || !output || !['ecg', 'scg'].includes(channel)) {
  console.error('Usage: node scripts/convert-xlsx.mjs <input.xlsx> <output.csv> <ecg|scg>')
  process.exit(1)
}

const workbook = XLSX.read(readFileSync(input))
const sheet = workbook.Sheets[workbook.SheetNames[0]]
const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }).slice(1) // skip the header row

const lines = [`time_s,${channel}_V`]
for (const [time, value] of rows) {
  if (typeof time !== 'number' || typeof value !== 'number') continue // skip empty or text rows
  lines.push(`${time},${value}`)
}

const samples = lines.length - 1
// fs from the whole time column: the per-row dt (0.000333) is truncated and would give 3003 Hz.
const first = Number(lines[1].split(',')[0])
const last = Number(lines[samples].split(',')[0])
const fs = Math.round((samples - 1) / (last - first))
writeFileSync(output, lines.join('\n') + '\n')
console.log(`Wrote ${samples} samples (fs = ${fs} Hz) to ${output}`)
