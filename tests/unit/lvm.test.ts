import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { columnLetter, listLvmColumns, parseLvm } from '../../src/io/lvm.ts'
import { sampleRateFromTimes } from '../../src/io/sampleRate.ts'

const fixture = readFileSync(new URL('../fixtures/ecg_synthetic.lvm', import.meta.url), 'utf8')
// Same layout as the newer lab files: ECG in B, SCG in D ("Voltage_1 (Filtered)"), flat channels in F and H.
const fourChannels = readFileSync(
  new URL('../fixtures/ecg_scg_synthetic_4ch.lvm', import.meta.url),
  'utf8',
)

const HEADER = [
  'LabVIEW Measurement\t',
  '***End_of_Header***\t',
  '\t',
  'Channels\t1\t',
  'Samples\t1000\t',
  'Delta_X\t0.000333\t',
  '***End_of_Header***\t\t',
  'X_Value\tVoltage_0\tComment',
]

function lvm(header: string[], rows: string[]): string {
  return [...header, ...rows].join('\n') + '\n'
}

describe('sampleRateFromTimes', () => {
  it('uses the whole time column, not 1 / Δt of one row', () => {
    expect(Math.round(1 / 0.000333)).toBe(3003) // the error this rule avoids
    expect(sampleRateFromTimes(72000, 0, 23.999666)).toBe(3000) // lab ECG file
    expect(sampleRateFromTimes(28000, 0, 9.333)).toBe(3000) // lab SCG file
  })

  it('works for other rates', () => {
    expect(sampleRateFromTimes(513, 0, 1)).toBe(512)
  })

  it('fails with fewer than 2 samples or a time column that does not increase', () => {
    expect(() => sampleRateFromTimes(1, 0, 0)).toThrow(/at least 2 samples/)
    expect(() => sampleRateFromTimes(10, 1, 1)).toThrow(/does not increase/)
  })
})

describe('parseLvm', () => {
  it('reads the synthetic ECG fixture: 6,000 samples at 3000 Hz (not 3003)', () => {
    const { fs, samples } = parseLvm(fixture)
    expect(fs).toBe(3000)
    expect(samples).toBeInstanceOf(Float32Array)
    expect(samples).toHaveLength(6000)
  })

  it('ignores the wrong "Samples 1000" header and counts the rows', () => {
    expect(fixture).toContain('Samples\t1000\t')
    expect(parseLvm(fixture).samples.length).not.toBe(1000)
  })

  it('returns the values in volts', () => {
    const { samples } = parseLvm(fixture)
    const dataLines = fixture.split('\n').filter((line) => /^\d/.test(line))
    expect(samples[0]).toBeCloseTo(Number(dataLines[0].split('\t')[1]), 6)
    expect(samples[5999]).toBeCloseTo(Number(dataLines[5999].split('\t')[1]), 6)
    expect(samples[0]).toBeCloseTo(1.6, 3) // DC offset of the synthetic ECG
  })

  it('reads Windows line endings (CRLF) like the lab file', () => {
    const { fs, samples } = parseLvm(fixture.replace(/\n/g, '\r\n'))
    expect(fs).toBe(3000)
    expect(samples).toHaveLength(6000)
  })

  it('skips empty lines in the data', () => {
    const { samples } = parseLvm(lvm(HEADER, ['0.000000\t1', '', '0.000333\t2', '0.000667\t3', '']))
    expect(Array.from(samples)).toEqual([1, 2, 3])
  })

  it('fails when the header is missing', () => {
    expect(() => parseLvm('0.0\t1\n0.1\t2\n')).toThrow(/Not a LabVIEW \.lvm file/)
  })

  it('fails on files with several segments', () => {
    const text = lvm(HEADER, ['0\t1', '0.1\t2', ...HEADER.slice(2), '0.2\t3'])
    expect(() => parseLvm(text)).toThrow(/several segments/)
  })

  it('fails on several channels without column titles (it cannot tell which is which)', () => {
    const header = HEADER.filter((line) => !line.startsWith('X_Value')).map((line) =>
      line.startsWith('Channels') ? 'Channels\t2\t' : line,
    )
    expect(() => parseLvm(lvm(header, ['0\t1\t5', '0.1\t2\t6']))).toThrow(/2 channels/)
  })

  it('fails on a malformed row and says which line', () => {
    const text = lvm(HEADER, ['0.000000\t1', '0.000333\tabc'])
    expect(() => parseLvm(text)).toThrow(/LVM line 10/)
  })

  it('fails with fewer than 2 rows', () => {
    expect(() => parseLvm(lvm(HEADER, ['0\t1']))).toThrow(/at least 2 samples/)
  })

  it('accepts column B (or no column) for a single-signal file', () => {
    expect(parseLvm(fixture, 'B').samples).toEqual(parseLvm(fixture).samples)
    expect(() => parseLvm(fixture, 'D')).toThrow(/Column D is not a signal .*B Voltage_0/)
  })
})

describe('parseLvm: multi-channel files', () => {
  const rows = fourChannels.split('\n').filter((line) => /^\d/.test(line))
  const cell = (row: number, column: number) => Number(rows[row].split('\t')[column])

  it('reads ECG from column B and SCG from column D of the same file', () => {
    const ecg = parseLvm(fourChannels, 'B')
    const scg = parseLvm(fourChannels, 'D')
    expect(ecg.fs).toBe(3000)
    expect(scg.fs).toBe(3000)
    expect(ecg.samples).toHaveLength(6000)
    expect(scg.samples).toHaveLength(6000)
    for (const row of [0, 1234, 5999]) {
      expect(ecg.samples[row]).toBe(Math.fround(cell(row, 1)))
      expect(scg.samples[row]).toBe(Math.fround(cell(row, 3)))
    }
    expect(ecg.samples[0]).toBeCloseTo(1.6, 6) // ECG DC offset, not the SCG or a flat channel
  })

  it('reads the time of a signal from the X_Value column on its left', () => {
    // Make the time column of D (column C) run 3 times slower: only D must change fs.
    const changed = fourChannels
      .split('\n')
      .map((line) => {
        if (!/^\d/.test(line)) return line
        const columns = line.split('\t')
        columns[2] = (Number(columns[0]) * 3).toFixed(6)
        return columns.join('\t')
      })
      .join('\n')
    expect(parseLvm(changed, 'B').fs).toBe(3000)
    expect(parseLvm(changed, 'D').fs).toBe(1000)
  })

  it('also reads the layout with one shared time column (X_Columns One)', () => {
    const header = HEADER.map((line) =>
      line.startsWith('X_Value') ? 'X_Value\tVoltage_0\tVoltage_1\tComment' : line,
    )
    const text = lvm(header, ['0\t1\t10', '0.001\t2\t20', '0.002\t3\t30'])
    expect(Array.from(parseLvm(text, 'C').samples)).toEqual([10, 20, 30])
    expect(parseLvm(text, 'C').fs).toBe(1000)
  })

  it('asks for a column when the file has several signals, and lists them', () => {
    expect(() => parseLvm(fourChannels)).toThrow(
      'This LVM file has 4 signals (B Voltage_0, D Voltage_1 (Filtered), F Voltage_2, H Voltage_3): ' +
        'choose a column',
    )
  })

  it('rejects a time column, a missing column or a lowercase letter', () => {
    expect(() => parseLvm(fourChannels, 'A')).toThrow(/Column A is not a signal/)
    expect(() => parseLvm(fourChannels, 'C')).toThrow(/Column C is not a signal/)
    expect(() => parseLvm(fourChannels, 'Z')).toThrow(/Column Z is not a signal/)
    expect(() => parseLvm(fourChannels, 'd')).toThrow(/Column d is not a signal/)
  })

  it('names the line and the columns of a malformed row', () => {
    const broken = fourChannels.replace(/\n0\.000333\t[^\n]*/, '\n0.000333\t1.6\t0.000333')
    expect(() => parseLvm(broken, 'D')).toThrow(
      /LVM line 25: expected a time in column C and a value in column D/,
    )
  })
})

describe('listLvmColumns', () => {
  it('lists the signal columns with their spreadsheet letter', () => {
    expect(listLvmColumns(fourChannels)).toEqual([
      { letter: 'B', name: 'Voltage_0', index: 1 },
      { letter: 'D', name: 'Voltage_1 (Filtered)', index: 3 },
      { letter: 'F', name: 'Voltage_2', index: 5 },
      { letter: 'H', name: 'Voltage_3', index: 7 },
    ])
    expect(listLvmColumns(fixture)).toEqual([{ letter: 'B', name: 'Voltage_0', index: 1 }])
  })

  it('needs only the header (the UI reads the first 64 kB of a large file)', () => {
    expect(listLvmColumns(fourChannels.slice(0, 2000))).toHaveLength(4)
  })

  it('returns an empty list for a file that is not an LVM or has no column line', () => {
    expect(listLvmColumns('time_s,scg_V\n0,1\n')).toEqual([])
    expect(listLvmColumns(lvm(HEADER.slice(0, -1), ['0\t1', '1\t2']))).toEqual([])
  })
})

describe('columnLetter', () => {
  it('turns a 0-based index into a spreadsheet letter', () => {
    const indices = [0, 1, 3, 25, 26, 27, 51, 52, 701, 702]
    expect(indices.map(columnLetter)).toEqual([
      'A',
      'B',
      'D',
      'Z',
      'AA',
      'AB',
      'AZ',
      'BA',
      'ZZ',
      'AAA',
    ])
  })
})
