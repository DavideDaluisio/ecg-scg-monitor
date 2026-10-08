import { describe, expect, it } from 'vitest'
import type { ChannelId } from '../../src/core/types.ts'
import {
  buildCsvExport,
  csvField,
  formatSample,
  type ExportChannel,
  type ExportFile,
} from '../../src/io/csvExport.ts'
import type { Marker, SavedSession } from '../../src/recording/types.ts'

function channel(id: ChannelId, fs: number, first: number, values: number[]): ExportChannel {
  return { id, fs, firstSampleIndex: first, samples: Float32Array.from(values) }
}

// The parts are built one at a time while they are read: read them all into one text.
function textOf(file: ExportFile): string {
  return Array.from(file.parts).join('')
}

function session(channels: ExportChannel[], markers: Marker[] = []): SavedSession {
  return {
    id: 1,
    name: 'session_2026-10-08_15-04-05',
    startIso: '2026-10-08T13:04:00.000Z',
    recordedAtIso: '2026-10-08T13:04:05.000Z',
    source: 'synthetic',
    description: 'Synthetic ECG + SCG',
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

const HEADER = [
  '# ecg-scg-monitor export v1',
  '# session=session_2026-10-08_15-04-05',
  '# start_iso=2026-10-08T13:04:00.000Z',
  '# recorded_at_iso=2026-10-08T13:04:05.000Z',
]
const SOURCE_LINES = [
  '# source=synthetic',
  '# description=Synthetic ECG + SCG',
  '# synthetic_heart_rate_bpm=72',
  '# synthetic_noise=false',
]

describe('buildCsvExport', () => {
  it('writes one file when every channel has the same fs (exact text)', () => {
    const channels = [
      channel('ecg', 10, 3, [1.5, NaN, 0.25]),
      channel('scg', 10, 3, [-0.001, 0.02, 3e-7]),
    ]
    const markers: Marker[] = [{ channel: 'ecg', sampleIndex: 4, label: 'stand up, left' }]

    const files = buildCsvExport(session(channels, markers), channels)

    expect(files).toHaveLength(1)
    expect(files[0].fileName).toBe('session_2026-10-08_15-04-05.csv')
    expect(textOf(files[0])).toBe(
      [
        ...HEADER,
        '# fs=10',
        ...SOURCE_LINES,
        'sample_index,time_s,ecg_V,scg_V,marker',
        '3,0.300000,1.5,-0.001,',
        '4,0.400000,,0.02,"stand up, left"', // NaN = empty cell; the comma forces quotes
        '5,0.500000,0.25,3e-7,',
        '',
      ].join('\n'),
    )
  })

  it('puts ECG before SCG and keeps the session sample index (no re-basing)', () => {
    const channels = [channel('scg', 3000, 141000, [0.1]), channel('ecg', 3000, 141000, [1.6])]
    const text = textOf(buildCsvExport(session(channels), channels)[0])
    expect(text).toContain('sample_index,time_s,ecg_V,scg_V,marker\n141000,47.000000,1.6,0.1,\n')
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
    const markers: Marker[] = [{ channel: 'scg', sampleIndex: 61, label: 'deep breath' }]

    const files = buildCsvExport(session(channels, markers), channels)

    expect(files.map((f) => f.fileName)).toEqual([
      'session_2026-10-08_15-04-05_ecg.csv',
      'session_2026-10-08_15-04-05_scg.csv',
    ])
    const ecg = textOf(files[0])
    const scg = textOf(files[1])
    expect(ecg).toContain('# fs=500\n')
    expect(ecg).toContain(
      'sample_index,time_s,ecg_V,marker\n10,0.020000,1,deep breath\n11,0.022000,2,\n',
    )
    expect(scg).toContain('# fs=3000\n')
    expect(scg).toContain('sample_index,time_s,scg_V,marker\n')
    expect(scg).toContain('\n61,0.020333,0,deep breath\n')
  })

  it('adds empty rows up to a marker placed after the last sample', () => {
    const channels = [channel('ecg', 10, 0, [1])]
    const markers: Marker[] = [{ channel: 'ecg', sampleIndex: 2, label: 'end' }]
    const rows = textOf(buildCsvExport(session(channels, markers), channels)[0]).split('\n')
    expect(rows.slice(-4)).toEqual(['0,0.000000,1,', '1,0.100000,,', '2,0.200000,,end', ''])
  })

  it('joins several markers on the same sample', () => {
    const channels = [channel('ecg', 10, 0, [1])]
    const markers: Marker[] = [
      { channel: 'ecg', sampleIndex: 0, label: 'rest' },
      { channel: 'ecg', sampleIndex: 0, label: 'movement' },
    ]
    const text = textOf(buildCsvExport(session(channels, markers), channels)[0])
    expect(text).toContain('\n0,0.000000,1,rest | movement\n')
  })

  it('builds a long session in parts of 5,000 rows, only when they are read', () => {
    const values = Array.from({ length: 12_000 }, (_, i) => i)
    const channels = [channel('ecg', 1000, 0, values)]
    const parts = buildCsvExport(session(channels), channels)[0].parts[Symbol.iterator]()

    expect(parts.next().value).toMatch(/^# ecg-scg-monitor export v1\n[^]*marker\n$/) // the header alone
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

describe('formatSample', () => {
  it('writes the shortest text, empty for a missing sample', () => {
    expect(formatSample(Math.fround(1.605213))).toBe('1.605213')
    expect(formatSample(Math.fround(0.02226))).toBe('0.02226')
    expect(formatSample(Math.fround(1.6))).toBe('1.6')
    expect(formatSample(Math.fround(-120))).toBe('-120')
    expect(formatSample(Math.fround(2.5e-7))).toBe('2.5e-7')
    expect(formatSample(0)).toBe('0')
    expect(formatSample(NaN)).toBe('')
  })

  it('reads back to exactly the same Float32 value (raw is sacred)', () => {
    // Deterministic pseudo-random values over many magnitudes, like ADC readings in volts.
    let seed = 12345
    const random = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648
      return seed / 2147483648
    }
    for (let i = 0; i < 20_000; i++) {
      const value = Math.fround((random() - 0.5) * 10 ** Math.floor(random() * 12 - 9))
      const text = formatSample(value)
      expect(Math.fround(Number(text))).toBe(value)
      expect(text.replace(/^-|e.*$|\./g, '').replace(/^0+/, '').length).toBeLessThanOrEqual(9)
    }
  })
})

describe('csvField', () => {
  it('quotes text with a separator, a quote or a comment character, and doubles quotes', () => {
    expect(csvField('stand up')).toBe('stand up')
    expect(csvField('a, b')).toBe('"a, b"')
    expect(csvField('say "go"')).toBe('"say ""go"""')
    expect(csvField('trial #2')).toBe('"trial #2"')
  })
})
