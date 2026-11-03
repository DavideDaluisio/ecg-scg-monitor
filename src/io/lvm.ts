// Parser for LabVIEW .lvm text files with one segment (format: docs/data-formats.md).
// A file may hold several channels side by side (e.g. ECG in column B, SCG in column D): the caller picks one by
// its spreadsheet column letter, the letter the lab sees when the file is opened in Excel.
import type { ParsedSignal } from './parsedSignal.ts'
import { sampleRateFromTimes } from './sampleRate.ts'

const END_OF_HEADER = '***End_of_Header***'
const TIME_TITLE = 'X_Value' // title of a time column
const COMMENT_TITLE = 'Comment' // LabVIEW's last column, always empty in the lab files

/** A signal column of an LVM file (not a time or comment column). */
export interface LvmColumn {
  letter: string // spreadsheet letter, e.g. "D"
  name: string // title in the file, e.g. "Voltage_1 (Filtered)"
  index: number // position in a data row (A = 0)
}

/**
 * Reads one channel. `column` is the spreadsheet letter of the signal (e.g. "D"); it may be null only when the
 * file has a single signal column. Each signal's time is the nearest `X_Value` column on its left.
 */
export function parseLvm(text: string, column: string | null = null): ParsedSignal {
  // The lab files use Windows line endings (CRLF).
  const lines = text.split(/\r?\n/)

  const headerEnds = findHeaderEnds(lines)
  if (headerEnds.length < 2) {
    throw new Error('Not a LabVIEW .lvm file: header ("***End_of_Header***") not found')
  }
  if (headerEnds.length > 2) {
    throw new Error('LVM files with several segments are not supported yet')
  }

  // After the segment header comes the column line (X_Value, Voltage_0, …, Comment), then the data rows.
  // "Samples" in the segment header is not read on purpose: the lab files say 1000 but have many more rows.
  let firstDataLine = headerEnds[1] + 1
  let timeIndex = 0
  let valueIndex = 1
  if (lines[firstDataLine]?.startsWith(TIME_TITLE)) {
    const titles = lines[firstDataLine].split('\t')
    valueIndex = chooseColumn(titles, column).index
    timeIndex = titles.lastIndexOf(TIME_TITLE, valueIndex)
    if (timeIndex < 0) {
      throw new Error(
        `LVM column ${columnLetter(valueIndex)} has no time column (X_Value) on its left`,
      )
    }
    firstDataLine++
  } else {
    // No column line: only the simple "time<TAB>value" layout can be read safely.
    const channels = channelCount(lines, headerEnds)
    if (channels !== 1) {
      throw new Error(`This LVM file has ${channels} channels but no column titles: not supported`)
    }
    if (column !== null && column !== 'B') {
      throw new Error(`This LVM file has one signal, in column B (not ${column})`)
    }
  }

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
    const columns = line.split('\t')
    const timeText = columns[timeIndex] ?? ''
    const valueText = columns[valueIndex] ?? ''
    const time = Number(timeText)
    const value = Number(valueText)
    if (timeText === '' || valueText === '' || isNaN(time) || isNaN(value)) {
      throw new Error(
        `LVM line ${i + 1}: expected a time in column ${columnLetter(timeIndex)} and a value in column ` +
          `${columnLetter(valueIndex)}, got "${line}"`,
      )
    }
    if (n === 0) firstTime = time
    lastTime = time
    samples[n++] = value
  }

  return { fs: sampleRateFromTimes(count, firstTime, lastTime), samples }
}

/**
 * The signal columns of an LVM file, read from its header only (the UI passes just the first kilobytes of a
 * large file). Empty when the file has no header or no column line.
 */
export function listLvmColumns(text: string): LvmColumn[] {
  const lines = text.split(/\r?\n/)
  const headerEnds = findHeaderEnds(lines)
  const columnLine = headerEnds.length >= 2 ? lines[headerEnds[1] + 1] : undefined
  if (columnLine === undefined || !columnLine.startsWith(TIME_TITLE)) return []
  return signalColumns(columnLine.split('\t'))
}

/** Spreadsheet letter of a 0-based column: 0 → "A", 25 → "Z", 26 → "AA". */
export function columnLetter(index: number): string {
  let letters = ''
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    letters = String.fromCharCode(65 + ((n - 1) % 26)) + letters
  }
  return letters
}

// Indices of the lines that start with "***End_of_Header***": one after the file header, one after each
// segment header.
function findHeaderEnds(lines: string[]): number[] {
  const headerEnds: number[] = []
  lines.forEach((line, i) => {
    if (line.startsWith(END_OF_HEADER)) headerEnds.push(i)
  })
  return headerEnds
}

function signalColumns(titles: string[]): LvmColumn[] {
  const columns: LvmColumn[] = []
  titles.forEach((title, index) => {
    if (title === '' || title === TIME_TITLE || title === COMMENT_TITLE) return
    columns.push({ letter: columnLetter(index), name: title, index })
  })
  return columns
}

function chooseColumn(titles: string[], column: string | null): LvmColumn {
  const columns = signalColumns(titles)
  const list = columns.map((c) => `${c.letter} ${c.name}`).join(', ')
  if (columns.length === 0) throw new Error('This LVM file has no signal column')
  if (column === null) {
    if (columns.length === 1) return columns[0]
    throw new Error(`This LVM file has ${columns.length} signals (${list}): choose a column`)
  }
  const chosen = columns.find((c) => c.letter === column)
  if (chosen === undefined) {
    throw new Error(`Column ${column} is not a signal of this LVM file (signals: ${list})`)
  }
  return chosen
}

// "Channels" from the segment header (1 when it is missing).
function channelCount(lines: string[], headerEnds: number[]): number {
  for (let i = headerEnds[0] + 1; i < headerEnds[1]; i++) {
    const [key, value] = lines[i].split('\t')
    if (key === 'Channels') return Number(value)
  }
  return 1
}
