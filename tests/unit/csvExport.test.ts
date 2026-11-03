import { describe, expect, it } from 'vitest'
import type { ChannelId } from '../../src/core/types.ts'
import { buildCsvExport, csvField, type ExportFile } from '../../src/io/csvExport.ts'
import { localDateTime, type ExportChannel } from '../../src/io/exportShared.ts'
import type { Marker, SavedSession } from '../../src/recording/types.ts'

const BOM = String.fromCharCode(0xfeff) // byte-order mark: Excel reads the file as UTF-8

function channel(id: ChannelId, fs: number, first: number, values: number[]): ExportChannel {
  return { id, fs, firstSampleIndex: first, samples: Float32Array.from(values) }
}

// The parts are built one at a time while they are read: read them all into one text.
function textOf(file: ExportFile): string {
  return Array.from(file.parts).join('')
}

// The data rows (and the final empty line), without the header.
function dataRows(file: ExportFile): string[] {
  const lines = textOf(file).split('\n')
  return lines.slice(lines.findIndex((line) => line.startsWith('sample_index')) + 1)
}

const RECORDED_ISO = '2026-10-08T13:04:05.000Z'
const START_ISO = '2026-10-08T13:04:00.000Z'

function session(
  channels: ExportChannel[],
  markers: Marker[] = [],
  description = 'Synthetic ECG + SCG',
): SavedSession {
  return {
    id: 1,
    name: 'session_2026-10-08_15-04-05',
    startIso: START_ISO,
    recordedAtIso: RECORDED_ISO,
    source: 'synthetic',
    description,
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

// The lines after the format line.
const SESSION_LINES = [
  '# Session: session_2026-10-08_15-04-05',
  `# Recorded: ${localDateTime(RECORDED_ISO)}`,
  `# Acquisition started: ${localDateTime(START_ISO)} = sample_index 0`,
]
const COLUMN_LINES = [
  '#',
  '# Columns:',
  '#   sample_index = sample number since the acquisition started (the number the app shows for a marker)',
  '#   time_s = seconds since the start of this recording',
  '#   ecg_V = ECG in volts exactly as received (not filtered or resampled by the app) - empty cell = missing sample',
  '#   scg_V = SCG in volts exactly as received (not filtered or resampled by the app) - empty cell = missing sample',
  "#   marker = label of the marker placed on this sample ('|' between several)",
]

describe('buildCsvExport', () => {
  const sameFs = [
    channel('ecg', 10, 3, [1.5, NaN, 0.25]),
    channel('scg', 10, 3, [-0.001, 0.02, 3e-7]),
  ]
  const markers: Marker[] = [{ channel: 'ecg', sampleIndex: 4, label: 'stand up, left' }]

  it('writes one standard file when every channel has the same fs (exact text)', () => {
    const files = buildCsvExport(session(sameFs, markers), sameFs)

    expect(files).toHaveLength(1)
    expect(files[0].fileName).toBe('session_2026-10-08_15-04-05.csv')
    expect(textOf(files[0])).toBe(
      [
        BOM +
          '# ECG/SCG Monitor export - format v2 - standard CSV (comma separator and point decimals)',
        ...SESSION_LINES,
        '# Duration (s): 0.300',
        '# Sampling rate (Hz): 10',
        '# Source: synthetic',
        '# Source details: Synthetic ECG + SCG',
        '# Markers: 1',
        '# synthetic_heart_rate_bpm: 72',
        '# synthetic_noise: false',
        ...COLUMN_LINES,
        "# Python: pandas.read_csv with comment='#'",
        'sample_index,time_s,ecg_V,scg_V,marker',
        '3,0.000000,1.5,-0.001,', // time_s starts at 0 at Record, sample_index stays the live one
        '4,0.100000,,0.02,"stand up, left"', // NaN = empty cell; the comma forces quotes
        '5,0.200000,0.25,3e-7,',
        '',
      ].join('\n'),
    )
  })

  it('never puts "," or ";" in a header line, so Excel keeps each line in one cell (any language)', () => {
    const channels = [channel('ecg', 10, 0, [1]), channel('scg', 10, 0, [2])]
    const odd = session(channels, markers, 'a, b; c')
    const lines = textOf(buildCsvExport(odd, channels)[0]).split('\n')
    const header = lines.slice(
      0,
      lines.findIndex((line) => line.startsWith('sample_index')),
    )
    expect(header.length).toBeGreaterThan(15)
    expect(header.filter((line) => /[,;]/.test(line))).toEqual([])
  })

  it('keeps one header line per cell: no line break, "," or ";" in free text', () => {
    const channels = [channel('ecg', 10, 0, [1])]
    const description = 'ecg_subject02 · 3000 Hz · 237,000 samples;\nloop'
    const text = textOf(buildCsvExport(session(channels, [], description), channels)[0])
    expect(text).toContain('\n# Source details: ecg_subject02 · 3000 Hz · 237 000 samples loop\n')
  })

  it('puts ECG before SCG, keeps the live sample index and starts time_s at 0', () => {
    const channels = [channel('scg', 3000, 141000, [0.1]), channel('ecg', 3000, 141000, [1.6])]
    const text = textOf(buildCsvExport(session(channels), channels)[0])
    expect(text).toContain('sample_index,time_s,ecg_V,scg_V,marker\n141000,0.000000,1.6,0.1,\n')
  })

  it('leaves empty cells where a channel has no sample (channels starting at different indices)', () => {
    const channels = [channel('ecg', 10, 0, [1, 2, 3]), channel('scg', 10, 2, [9])]
    const rows = textOf(buildCsvExport(session(channels), channels)[0]).split('\n')
    expect(rows.slice(-4)).toEqual(['0,0.000000,1,,', '1,0.100000,2,,', '2,0.200000,3,9,', ''])
  })

  it('writes one file per channel when the fs differ, moving a marker to round(t × fs)', () => {
    const channels = [
      channel('ecg', 500, 10, [1, 2, 3]),
      channel('scg', 3000, 60, [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
    ]
    // On SCG (the reference channel: highest fs) at sample 61 = 20.33 ms → ECG sample round(10.17) = 10.
    const deepBreath: Marker[] = [{ channel: 'scg', sampleIndex: 61, label: 'deep breath' }]

    const files = buildCsvExport(session(channels, deepBreath), channels)

    expect(files.map((f) => f.fileName)).toEqual([
      'session_2026-10-08_15-04-05_ecg.csv',
      'session_2026-10-08_15-04-05_scg.csv',
    ])
    const ecg = textOf(files[0])
    const scg = textOf(files[1])
    expect(ecg).toContain('\n# Sampling rate (Hz): 500\n')
    expect(ecg).toContain(
      'sample_index,time_s,ecg_V,marker\n10,0.000000,1,deep breath\n11,0.002000,2,\n',
    )
    expect(ecg).not.toContain('scg_V')
    expect(scg).toContain('\n# Sampling rate (Hz): 3000\n')
    expect(scg).toContain('sample_index,time_s,scg_V,marker\n60,0.000000,0,\n')
    expect(scg).toContain('\n61,0.000333,0,deep breath\n')
  })

  it('uses the same zero for both files: the first recorded sample of any channel', () => {
    // SCG starts recording at 20 ms (sample 60 at 3000 Hz), ECG at 22 ms (sample 11 at 500 Hz).
    const channels = [channel('ecg', 500, 11, [1]), channel('scg', 3000, 60, [0])]
    const [ecg, scg] = buildCsvExport(session(channels), channels)
    expect(dataRows(ecg)[0]).toBe('11,0.002000,1,')
    expect(dataRows(scg)[0]).toBe('60,0.000000,0,')
  })

  it('adds empty rows up to a marker placed after the last sample', () => {
    const channels = [channel('ecg', 10, 0, [1])]
    const end: Marker[] = [{ channel: 'ecg', sampleIndex: 2, label: 'end' }]
    const rows = textOf(buildCsvExport(session(channels, end), channels)[0]).split('\n')
    expect(rows.slice(-4)).toEqual(['0,0.000000,1,', '1,0.100000,,', '2,0.200000,,end', ''])
  })

  it('joins several markers on the same sample', () => {
    const channels = [channel('ecg', 10, 0, [1])]
    const two: Marker[] = [
      { channel: 'ecg', sampleIndex: 0, label: 'rest' },
      { channel: 'ecg', sampleIndex: 0, label: 'movement' },
    ]
    const text = textOf(buildCsvExport(session(channels, two), channels)[0])
    expect(text).toContain('\n0,0.000000,1,rest | movement\n')
    expect(text).toContain('\n# Markers: 2\n')
  })

  it('builds a long session in parts of 5,000 rows, only when they are read', () => {
    const values = Array.from({ length: 12_000 }, (_, i) => i)
    const channels = [channel('ecg', 1000, 0, values)]
    const parts = buildCsvExport(session(channels), channels)[0].parts[Symbol.iterator]()

    // The header alone.
    const header = parts.next().value as string
    expect(header.startsWith(`${BOM}# ECG/SCG Monitor export - format v2 - `)).toBe(true)
    expect(header.endsWith('marker\n')).toBe(true)
    const second = parts.next().value as string
    expect(second.split('\n')).toHaveLength(5_001) // 5,000 rows + the final line break
    expect(second.startsWith('0,0.000000,0,\n')).toBe(true)
    expect((parts.next().value as string).startsWith('5000,5.000000,5000,\n')).toBe(true)
    expect((parts.next().value as string).split('\n')).toHaveLength(2_001) // the last 2,000 rows
    expect(parts.next().done).toBe(true)
  })

  it('joins the parts into the full file', () => {
    const values = Array.from({ length: 25_000 }, (_, i) => i)
    const channels = [channel('ecg', 1000, 0, values)]
    const rows = textOf(buildCsvExport(session(channels), channels)[0])
      .split('\n')
      .filter((line) => /^\d/.test(line))
    expect(rows).toHaveLength(25_000)
    expect(rows[10_000]).toBe('10000,10.000000,10000,')
    expect(rows[24_999]).toBe('24999,24.999000,24999,')
  })

  it('rejects a session without channels', () => {
    expect(() => buildCsvExport(session([]), [])).toThrow(/no recorded channel/)
  })
})

describe('csvField', () => {
  it('quotes text with the separator, a quote or a comment character, and doubles quotes', () => {
    expect(csvField('stand up')).toBe('stand up')
    expect(csvField('a, b')).toBe('"a, b"')
    expect(csvField('say "go"')).toBe('"say ""go"""')
    expect(csvField('trial #2')).toBe('"trial #2"')
  })

  it('does not quote ";" (the separator is ",")', () => {
    expect(csvField('a; b')).toBe('a; b')
  })
})
