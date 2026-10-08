import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseCsv } from '../../src/io/csv.ts'

const fixture = readFileSync(new URL('../fixtures/scg_synthetic.csv', import.meta.url), 'utf8')

function csv(lines: string[]): string {
  return lines.join('\n') + '\n'
}

describe('parseCsv', () => {
  it('reads the synthetic SCG fixture: 6,000 samples at 3000 Hz', () => {
    const { fs, samples } = parseCsv(fixture)
    expect(fs).toBe(3000)
    expect(samples).toBeInstanceOf(Float32Array)
    expect(samples).toHaveLength(6000)
  })

  it('returns the values in volts', () => {
    const { samples } = parseCsv(fixture)
    const dataLines = fixture.trim().split('\n').slice(1)
    expect(samples[0]).toBeCloseTo(Number(dataLines[0].split(',')[1]), 6)
    expect(samples[5999]).toBeCloseTo(Number(dataLines[5999].split(',')[1]), 6)
    // The first AO burst of the synthetic SCG peaks around ±0.05 V.
    const peak = samples.reduce((max, value) => Math.max(max, Math.abs(value)), 0)
    expect(peak).toBeGreaterThan(0.03)
    expect(peak).toBeLessThan(0.06)
  })

  it('reads the public SCG demo: 30,000 samples at 3000 Hz', () => {
    const demo = readFileSync(
      new URL('../../public/samples/scg_synthetic_demo.csv', import.meta.url),
      'utf8',
    )
    const { fs, samples } = parseCsv(demo)
    expect(fs).toBe(3000)
    expect(samples).toHaveLength(30000)
  })

  it('reads Windows line endings (CRLF) and a byte-order mark (BOM) from Excel', () => {
    const { fs, samples } = parseCsv('﻿' + fixture.replace(/\n/g, '\r\n'))
    expect(fs).toBe(3000)
    expect(samples).toHaveLength(6000)
  })

  it('accepts times without trailing zeros, like the lab file ("0" instead of "0.000000")', () => {
    const { fs, samples } = parseCsv(
      csv(['time_s,scg_V', '0,0.02226', '0.000333,0.02166', '0.000667,0.021', '0.001,0.0205']),
    )
    expect(fs).toBe(3000)
    expect(samples[0]).toBeCloseTo(0.02226, 6)
  })

  it('works without a header line', () => {
    const { samples } = parseCsv(csv(['0,1', '0.5,2', '1,3']))
    expect(Array.from(samples)).toEqual([1, 2, 3])
  })

  it('skips empty lines', () => {
    const { samples } = parseCsv(csv(['', 'time_s,scg_V', '0,1', '', '0.5,2', '1,3', '']))
    expect(Array.from(samples)).toEqual([1, 2, 3])
  })

  it('fails on a malformed row and says which line', () => {
    expect(() => parseCsv(csv(['time_s,scg_V', '0,1', '0.5,abc']))).toThrow(/CSV line 3/)
    expect(() => parseCsv(csv(['time_s,scg_V', '0,1', '0.5,']))).toThrow(/CSV line 3/)
  })

  it('fails on ";" separators and "," decimal separators instead of misreading them', () => {
    expect(() => parseCsv(csv(['time_s;scg_V', '0;1', '0.5;2']))).toThrow(/CSV line 2/)
    expect(() => parseCsv(csv(['time_s;scg_V', '0,0;1,5', '0,5;2,5']))).toThrow(/CSV line 2/)
  })

  it('fails on more than 2 columns', () => {
    expect(() => parseCsv(csv(['time_s,x_V,y_V', '0,1,2', '0.5,3,4']))).toThrow(/CSV line 2/)
  })

  it('fails on an empty file or fewer than 2 rows', () => {
    expect(() => parseCsv('')).toThrow(/empty/)
    expect(() => parseCsv(csv(['time_s,scg_V']))).toThrow(/at least 2 samples.*found 0/)
    expect(() => parseCsv(csv(['time_s,scg_V', '0,1']))).toThrow(/at least 2 samples.*found 1/)
  })
})
