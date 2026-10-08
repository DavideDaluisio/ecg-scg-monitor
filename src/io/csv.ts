// Parser for CSV recordings: one header line, then "time,value" rows (format: docs/data-formats.md).
import type { ParsedSignal } from './parsedSignal.ts'
import { sampleRateFromTimes } from './sampleRate.ts'

export function parseCsv(text: string): ParsedSignal {
  // Files saved by Excel may start with an invisible byte-order mark (BOM); Windows uses CRLF line endings.
  const lines = text.replace(/^﻿/, '').split(/\r?\n/)

  // The header ("time_s,scg_V") is the first non-empty line, when its first cell is not a number.
  // Its channel name is not used: the channel comes from the manifest or from the button the user pressed.
  let firstDataLine = lines.findIndex((line) => line.trim() !== '')
  if (firstDataLine === -1) throw new Error('The CSV file is empty')
  if (!isNumber(lines[firstDataLine].split(',')[0])) firstDataLine++

  // First pass: count the rows, so the Float32Array is allocated once with the right size.
  let count = 0
  for (let i = firstDataLine; i < lines.length; i++) {
    if (lines[i].trim() !== '') count++
  }

  const samples = new Float32Array(count)
  let firstTime = NaN
  let lastTime = NaN
  let n = 0
  for (let i = firstDataLine; i < lines.length; i++) {
    const line = lines[i]
    if (line.trim() === '') continue
    // Exactly 2 cells: this also rejects ";" separators and "," decimal separators instead of misreading them.
    const cells = line.split(',')
    if (cells.length !== 2 || !isNumber(cells[0]) || !isNumber(cells[1])) {
      throw new Error(
        `CSV line ${i + 1}: expected "time,value" with "." as decimal separator, got "${line}"`,
      )
    }
    const time = Number(cells[0])
    if (n === 0) firstTime = time
    lastTime = time
    samples[n++] = Number(cells[1])
  }

  return { fs: sampleRateFromTimes(count, firstTime, lastTime), samples }
}

// Number('') is 0, so empty cells must be rejected explicitly.
function isNumber(cell: string): boolean {
  return cell.trim() !== '' && !isNaN(Number(cell))
}
