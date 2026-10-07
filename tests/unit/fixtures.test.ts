// Sanity checks on the synthetic fixtures that the parser tests (M1, M2) will rely on.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

function readFixture(name: string): string[] {
  return readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8')
    .trim()
    .split('\n')
}

describe('ecg_synthetic.lvm', () => {
  const lines = readFixture('ecg_synthetic.lvm')
  const dataStart = lines.findIndex((line) => line.startsWith('X_Value')) + 1
  const rows = lines.slice(dataStart)

  it('has 2 s of data at 3000 Hz', () => {
    expect(rows).toHaveLength(6000)
  })

  it('keeps the "Samples 1000" header quirk of the lab file', () => {
    expect(lines).toContain('Samples\t1000\t')
  })
})

describe('scg_synthetic.csv', () => {
  const lines = readFixture('scg_synthetic.csv')

  it('has the expected header and 6000 samples', () => {
    expect(lines[0]).toBe('time_s,scg_V')
    expect(lines).toHaveLength(6001)
  })
})
