// The Excel export, zipped like in the app and read back with SheetJS (the library the app uses to import .xlsx):
// sheets, cells, every sample exactly, markers on the right row.
import { unzipSync, strFromU8 } from 'fflate'
import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import type { ChannelId } from '../../src/core/types.ts'
import { localDateTime, type ExportChannel } from '../../src/io/exportShared.ts'
import {
  buildXlsxExport,
  minutesSeconds,
  XLSX_MIME_TYPE,
  type XlsxExportOptions,
} from '../../src/io/xlsxExport.ts'
import { zipToBlob } from '../../src/io/zip.ts'
import type { Marker, SavedSession } from '../../src/recording/types.ts'

function channel(id: ChannelId, fs: number, first: number, values: number[]): ExportChannel {
  return { id, fs, firstSampleIndex: first, samples: Float32Array.from(values) }
}

function session(channels: ExportChannel[], markers: Marker[] = []): SavedSession {
  return {
    id: 1,
    name: 'session_2026-10-08_15-04-05',
    startIso: '2026-10-08T13:04:00.000Z',
    recordedAtIso: '2026-10-08T13:04:05.000Z',
    source: 'synthetic',
    description: 'Synthetic ECG + SCG · 72 bpm',
    settings: { synthetic_heart_rate_bpm: 72, synthetic_noise: false },
    channels: channels.map(({ id, fs, firstSampleIndex, samples }) => ({
      id,
      fs,
      firstSampleIndex,
      sampleCount: samples.length,
    })),
    markers,
    status: 'complete',
  }
}

type Cell = string | number | boolean | null

// Builds the .xlsx exactly like the app (build + zip) and opens it with SheetJS.
async function exportAndRead(
  channels: ExportChannel[],
  markers: Marker[] = [],
  options?: XlsxExportOptions,
) {
  const workbook = buildXlsxExport(session(channels, markers), channels, options)
  const blob = await zipToBlob(workbook.entries, XLSX_MIME_TYPE)
  const bytes = new Uint8Array(await blob.arrayBuffer())
  const book = XLSX.read(bytes, { type: 'array' })
  // Every row of a sheet as an array of cells, null = empty cell.
  const rows = (name: string): Cell[][] =>
    XLSX.utils.sheet_to_json<Cell[]>(book.Sheets[name], {
      header: 1,
      defval: null,
      blankrows: true,
    })
  // The XML of a sheet, by its position (1 = Info), to check what SheetJS does not read back (styles, panes).
  const sheetXml = (position: number) =>
    strFromU8(unzipSync(bytes)[`xl/worksheets/sheet${position}.xml`])
  return { fileName: workbook.fileName, type: blob.type, book, rows, sheetXml }
}

describe('buildXlsxExport', () => {
  const sameFs = [
    channel('ecg', 10, 3, [1.5, NaN, 0.25]),
    channel('scg', 10, 3, [-0.001, 0.02, 3e-7]),
  ]
  const markers: Marker[] = [{ channel: 'ecg', sampleIndex: 4, label: 'stand up & <talk> "now"' }]

  it('has an Info, a Markers and a Data sheet', async () => {
    const { fileName, type, book } = await exportAndRead(sameFs, markers)
    expect(fileName).toBe('session_2026-10-08_15-04-05.xlsx')
    expect(type).toBe(XLSX_MIME_TYPE)
    expect(book.SheetNames).toEqual(['Info', 'Markers', 'Data'])
  })

  it('writes the data sheet: time from 0, volts exactly, empty missing samples, markers, sample index', async () => {
    const { rows } = await exportAndRead(sameFs, markers)
    expect(rows('Data')).toEqual([
      ['Time (s)', 'ECG (V)', 'SCG (V)', 'Marker', 'Sample index'],
      // Each value is the shortest decimal of its Float32 (read back exactly: see "keeps every sample exactly").
      [0, 1.5, -0.001, null, 3],
      [0.1, null, 0.02, 'stand up & <talk> "now"', 4],
      [0.2, 0.25, 3e-7, null, 5],
    ])
  })

  it('makes the header bold and frozen, and the marked row yellow', async () => {
    const { sheetXml } = await exportAndRead(sameFs, markers)
    const data = sheetXml(3)
    expect(data).toContain('state="frozen"')
    expect(data).toContain('<c r="A1" s="1" t="inlineStr">') // header style
    expect(data).toContain('<row r="3"><c r="A3" s="4">') // marked row: yellow, 6 decimals
    expect(data).toContain('<c r="B3" s="3"/>') // missing sample on a marked row: empty but yellow
    expect(data).toContain('<row r="2"><c r="A2" s="2">') // other rows: 6 decimals only
  })

  it('lists the markers with their time since Record and sample index', async () => {
    const two: Marker[] = [...markers, { channel: 'ecg', sampleIndex: 5, label: 'sit down' }]
    const { rows } = await exportAndRead(sameFs, two)
    expect(rows('Markers')).toEqual([
      ['#', 'Time (s)', 'Time (min:s)', 'Name', 'Sample index'],
      [1, 0.1, '00:00.100', 'stand up & <talk> "now"', 4],
      [2, 0.2, '00:00.200', 'sit down', 5],
    ])
  })

  it('says so when there are no markers', async () => {
    const { rows } = await exportAndRead(sameFs)
    expect(rows('Markers')[1]).toEqual([null, null, null, 'No markers in this recording', null])
  })

  it('describes the session and the columns on the Info sheet', async () => {
    const { rows } = await exportAndRead(sameFs, markers)
    const info = new Map(rows('Info').map((row) => [row[0], row[1]]))
    expect(rows('Info')[0][0]).toBe('ECG/SCG Monitor export')
    expect(info.get('Session')).toBe('session_2026-10-08_15-04-05')
    // The wall-clock date and time of the recording (local time of the computer that exports).
    expect(info.get('Recorded')).toBe(localDateTime('2026-10-08T13:04:05.000Z'))
    expect(info.get('Recorded')).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:05 local time \(UTC[+-]\d{2}:\d{2}\)$/)
    expect(info.get('Acquisition started')).toBe(
      `${localDateTime('2026-10-08T13:04:00.000Z')} (= sample index 0)`,
    )
    expect(info.get('Duration')).toBe('0.300 s (00:00.300)')
    expect(info.get('Channels')).toBe('ECG 10 Hz · SCG 10 Hz')
    expect(info.get('Source details')).toBe('Synthetic ECG + SCG · 72 bpm')
    expect(info.get('Markers')).toBe('1 (sheet Markers)')
    expect(info.get('synthetic_heart_rate_bpm')).toBe(72)
    expect(info.get('synthetic_noise')).toBe('false')
    expect(info.get('Data sheets')).toBe('Data')
    expect(info.get('ECG (V)')).toMatch(/volts exactly as received/)
  })

  it('splits a long recording into sheets of whole minutes, without losing or repeating a sample', async () => {
    // 1 Hz and at most 150 rows per sheet: 2 minutes (120 rows) per sheet, 300 samples = 5 minutes.
    const values = Array.from({ length: 300 }, (_, i) => i / 1000)
    const channels = [channel('ecg', 1, 40, values)]
    const { book, rows } = await exportAndRead(channels, [], { maxDataRowsPerSheet: 150 })

    const dataSheets = ['Data 0-2 min', 'Data 2-4 min', 'Data 4-5 min']
    expect(book.SheetNames).toEqual(['Info', 'Markers', ...dataSheets])
    const dataRows = dataSheets.flatMap((name) => {
      const sheet = rows(name)
      expect(sheet[0]).toEqual(['Time (s)', 'ECG (V)', 'Marker', 'Sample index']) // a header on each
      return sheet.slice(1)
    })
    expect(rows('Data 0-2 min')).toHaveLength(121)
    expect(dataRows.map((row) => row[3])).toEqual(values.map((_, i) => 40 + i))
    expect(dataRows.map((row) => row[0])).toEqual(values.map((_, i) => i))
    expect(dataRows.map((row) => Math.fround(row[1] as number))).toEqual(
      values.map((v) => Math.fround(v)),
    )
    const info = new Map(rows('Info').map((row) => [row[0], row[1]]))
    expect(info.get('Data sheets')).toBe(dataSheets.join(', '))
  })

  it('gives each channel its own sheet when the fs differ, a marker at round(t × fs) in each', async () => {
    const channels = [
      channel('ecg', 500, 10, [1, 2, 3]),
      channel('scg', 3000, 60, new Array<number>(18).fill(0)),
    ]
    // On SCG (the reference channel: highest fs) at sample 61 = 20.33 ms → ECG sample round(10.17) = 10.
    const deepBreath: Marker[] = [{ channel: 'scg', sampleIndex: 61, label: 'deep breath' }]
    const { book, rows } = await exportAndRead(channels, deepBreath)

    expect(book.SheetNames).toEqual(['Info', 'Markers', 'ECG data', 'SCG data'])
    expect(rows('ECG data').slice(0, 3)).toEqual([
      ['Time (s)', 'ECG (V)', 'Marker', 'Sample index'],
      [0, 1, 'deep breath', 10],
      [0.002, 2, null, 11],
    ])
    expect(rows('SCG data')[2]).toEqual([0.000333, 0, 'deep breath', 61])
    expect(rows('Markers')[1]).toEqual([1, 0.000333, '00:00.000', 'deep breath', 61])
  })

  it('keeps every sample exactly (raw is sacred)', async () => {
    let seed = 12345
    const random = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648
      return seed / 2147483648
    }
    const values = Array.from({ length: 3000 }, () =>
      Math.fround((random() - 0.5) * 10 ** Math.floor(random() * 12 - 9)),
    )
    const { rows } = await exportAndRead([channel('ecg', 3000, 0, values)])
    const read = rows('Data')
      .slice(1)
      .map((row) => Math.fround(row[1] as number))
    expect(read).toEqual(values)
  })

  it('rejects a session without channels', () => {
    expect(() => buildXlsxExport(session([]), [])).toThrow(/no recorded channel/)
  })
})

describe('zipToBlob', () => {
  it('reads the parts one at a time and pauses after each one', async () => {
    const read: string[] = []
    function* parts() {
      for (const part of ['<a>', 'b', '</a>']) {
        read.push(part)
        yield part
      }
    }
    let pauses = 0
    const blob = await zipToBlob([{ path: 'x.xml', parts: parts() }], 'application/zip', () => {
      pauses++
      expect(read).toHaveLength(pauses) // the next part is read only after the pause
      return Promise.resolve()
    })
    expect(pauses).toBe(3)
    const files = unzipSync(new Uint8Array(await blob.arrayBuffer()))
    expect(strFromU8(files['x.xml'])).toBe('<a>b</a>')
  })
})

describe('minutesSeconds', () => {
  it('writes minutes:seconds.milliseconds', () => {
    expect(minutesSeconds(0)).toBe('00:00.000')
    expect(minutesSeconds(12.3456)).toBe('00:12.346')
    expect(minutesSeconds(59.9996)).toBe('01:00.000')
    expect(minutesSeconds(3725.5)).toBe('62:05.500')
  })
})
