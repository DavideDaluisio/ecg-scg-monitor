// Parser for LabVIEW .lvm text files with one segment and one channel (format: docs/data-formats.md).
import type { ParsedSignal } from './parsedSignal.ts'
import { sampleRateFromTimes } from './sampleRate.ts'

const END_OF_HEADER = '***End_of_Header***'

export function parseLvm(text: string): ParsedSignal {
  // The lab files use Windows line endings (CRLF).
  const lines = text.split(/\r?\n/)

  const headerEnds: number[] = []
  lines.forEach((line, i) => {
    if (line.startsWith(END_OF_HEADER)) headerEnds.push(i)
  })
  if (headerEnds.length < 2) {
    throw new Error('Not a LabVIEW .lvm file: header ("***End_of_Header***") not found')
  }
  if (headerEnds.length > 2) {
    throw new Error('LVM files with several segments are not supported yet')
  }

  // Segment header, between the two "***End_of_Header***" lines.
  // "Samples" is not read on purpose: the lab file says 1000 but has 72,000 rows.
  for (let i = headerEnds[0] + 1; i < headerEnds[1]; i++) {
    const [key, value] = lines[i].split('\t')
    if (key === 'Channels' && value !== '1') {
      throw new Error(`LVM files with ${value} channels are not supported yet (only 1)`)
    }
  }

  // After the segment header comes the column line (X_Value, Voltage_0, Comment), then the data rows.
  let firstDataLine = headerEnds[1] + 1
  if (lines[firstDataLine]?.startsWith('X_Value')) firstDataLine++

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
    const time = Number(columns[0])
    const value = Number(columns[1])
    if (columns.length < 2 || columns[0] === '' || columns[1] === '' || isNaN(time) || isNaN(value)) {
      throw new Error(`LVM line ${i + 1}: expected "time<TAB>value", got "${line}"`)
    }
    if (n === 0) firstTime = time
    lastTime = time
    samples[n++] = value
  }

  return { fs: sampleRateFromTimes(count, firstTime, lastTime), samples }
}
