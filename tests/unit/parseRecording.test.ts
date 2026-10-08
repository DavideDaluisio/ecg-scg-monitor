import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import { parseRecording } from '../../src/io/parseRecording.ts'

function fixtureBytes(name: string): ArrayBuffer {
  return new Uint8Array(readFileSync(new URL(`../fixtures/${name}`, import.meta.url))).buffer
}

describe('parseRecording', () => {
  it('reads .lvm files with the LVM parser', async () => {
    const { fs, samples } = await parseRecording(
      'ecg_synthetic.lvm',
      fixtureBytes('ecg_synthetic.lvm'),
    )
    expect(fs).toBe(3000)
    expect(samples).toHaveLength(6000)
  })

  it('reads .csv files with the CSV parser, whatever the case of the extension', async () => {
    const { fs, samples } = await parseRecording(
      'SCG_SYNTHETIC.CSV',
      fixtureBytes('scg_synthetic.csv'),
    )
    expect(fs).toBe(3000)
    expect(samples).toHaveLength(6000)
  })

  it('reads .xlsx files with the XLSX parser', async () => {
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([
        ['Time (s)', 'Voltage (V)'],
        [0, 1],
        [1, 2],
      ]),
    )
    const data = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
    const { samples } = await parseRecording('scg_subject01.xlsx', data)
    expect(Array.from(samples)).toEqual([1, 2])
  })

  it('fails on other file types with a clear message', async () => {
    const data = new TextEncoder().encode('0,1\n1,2\n').buffer
    await expect(parseRecording('notes.txt', data)).rejects.toThrow('Unsupported file "notes.txt"')
    await expect(parseRecording('recording', data)).rejects.toThrow(/use \.lvm, \.csv or \.xlsx/)
  })
})
