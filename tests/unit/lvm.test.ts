import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseLvm } from '../../src/io/lvm.ts'
import { sampleRateFromTimes } from '../../src/io/sampleRate.ts'

const fixture = readFileSync(new URL('../fixtures/ecg_synthetic.lvm', import.meta.url), 'utf8')

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

  it('fails on files with several channels', () => {
    const header = HEADER.map((line) => (line.startsWith('Channels') ? 'Channels\t2\t' : line))
    expect(() => parseLvm(lvm(header, ['0\t1\t5', '0.1\t2\t6']))).toThrow(/2 channels/)
  })

  it('fails on a malformed row and says which line', () => {
    const text = lvm(HEADER, ['0.000000\t1', '0.000333\tabc'])
    expect(() => parseLvm(text)).toThrow(/LVM line 10/)
  })

  it('fails with fewer than 2 rows', () => {
    expect(() => parseLvm(lvm(HEADER, ['0\t1']))).toThrow(/at least 2 samples/)
  })
})
