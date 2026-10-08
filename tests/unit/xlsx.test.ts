// The .xlsx files are built in memory from the synthetic CSV fixture, so no binary fixture is committed.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import { parseCsv } from '../../src/io/csv.ts'
import { parseXlsx } from '../../src/io/xlsx.ts'

const fixture = readFileSync(new URL('../fixtures/scg_synthetic.csv', import.meta.url), 'utf8')
const fixtureRows = fixture
  .trim()
  .split('\n')
  .slice(1)
  .map((line) => line.split(',').map(Number))

const HEADER = ['Time (s)', 'Voltage (V)'] // as in the lab .xlsx file

/** Writes an .xlsx file in memory. Each argument is one sheet (rows of cells). */
function xlsx(...sheets: unknown[][][]): ArrayBuffer {
  const workbook = XLSX.utils.book_new()
  sheets.forEach((rows, i) =>
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), `Sheet${i + 1}`),
  )
  return XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
}

describe('parseXlsx', () => {
  it('reads the same samples and fs as the CSV of the same recording', async () => {
    const fromXlsx = await parseXlsx(xlsx([HEADER, ...fixtureRows]))
    const fromCsv = parseCsv(fixture)
    expect(fromXlsx.fs).toBe(3000)
    expect(fromXlsx.samples).toBeInstanceOf(Float32Array)
    expect(fromXlsx.samples).toHaveLength(6000)
    // Excel stores "-0.000000" as 0, and toEqual tells -0 from 0: "+ 0" turns every -0 into 0.
    const withoutNegativeZero = (samples: Float32Array) => Array.from(samples, (value) => value + 0)
    expect(withoutNegativeZero(fromXlsx.samples)).toEqual(withoutNegativeZero(fromCsv.samples))
  })

  it('works without a header row', async () => {
    const { samples } = await parseXlsx(
      xlsx([
        [0, 1],
        [0.5, 2],
        [1, 3],
      ]),
    )
    expect(Array.from(samples)).toEqual([1, 2, 3])
  })

  it('skips empty rows', async () => {
    const { samples } = await parseXlsx(xlsx([HEADER, [0, 1], [], [0.5, 2], [1, 3], []]))
    expect(Array.from(samples)).toEqual([1, 2, 3])
  })

  it('reads only the first sheet', async () => {
    const { samples } = await parseXlsx(
      xlsx([HEADER, [0, 1], [1, 2]], [HEADER, [0, 9], [1, 9], [2, 9]]),
    )
    expect(Array.from(samples)).toEqual([1, 2])
  })

  it('fails on text in a data row and says which Excel row', async () => {
    await expect(parseXlsx(xlsx([HEADER, [0, 1], [0.5, 'n/a'], [1, 3]]))).rejects.toThrow(
      /XLSX row 3/,
    )
  })

  it('fails on a row with only one of the two values', async () => {
    await expect(parseXlsx(xlsx([HEADER, [0, 1], [0.5], [1, 3]]))).rejects.toThrow(/XLSX row 3/)
  })

  it('fails on a third column (another signal) instead of reading only the first one', async () => {
    const rows = [
      ['Time (s)', 'X (V)', 'Y (V)'],
      [0, 1, 2],
      [1, 3, 4],
    ]
    await expect(parseXlsx(xlsx(rows))).rejects.toThrow(/XLSX row 2/)
  })

  it('fails on an empty sheet or fewer than 2 rows', async () => {
    await expect(parseXlsx(xlsx([]))).rejects.toThrow(/empty/)
    await expect(parseXlsx(xlsx([HEADER, [0, 1]]))).rejects.toThrow(/at least 2 samples/)
  })
})
