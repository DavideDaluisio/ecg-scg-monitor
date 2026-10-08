// M4 "done when", automated: SyntheticSource → Recorder → IndexedDB → CSV export, then the CSV is read back and
// every sample and marker must sit on the right sample index. scripts/check_export.py checks a real 5-min export
// from the app (by the peak positions, since it does not have the synthetic model).
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChannelId } from '../../src/core/types.ts'
import { buildCsvExport } from '../../src/io/csvExport.ts'
import { listSavedSessions, loadChannelSamples, openMonitorDb } from '../../src/recording/db.ts'
import { Recorder } from '../../src/recording/recorder.ts'
import { SyntheticSource } from '../../src/sources/SyntheticSource.ts'
import { ecgAt, scgAt } from '../../src/sources/syntheticSignals.ts'

const HEART_RATE_BPM = 72
const R_TO_AO_S = 0.08

interface CsvTable {
  fs: number
  firstIndex: number
  columns: Map<string, string[]> // column name → cells, one per row
}

// Reads one exported CSV: `# key=value` header lines, then the column line and the rows.
function readCsv(text: string): CsvTable {
  const lines = text.split('\n').filter((line) => line !== '')
  const header = new Map<string, string>()
  let i = 0
  for (; lines[i].startsWith('#'); i++) {
    const [key, ...rest] = lines[i].slice(2).split('=')
    header.set(key, rest.join('='))
  }
  const names = lines[i].split(',')
  const columns = new Map(names.map((name) => [name, [] as string[]]))
  for (const line of lines.slice(i + 1)) {
    line.split(',').forEach((cell, c) => columns.get(names[c])!.push(cell))
  }
  const indices = columns.get('sample_index')!.map(Number)
  indices.forEach((index, row) => expect(index).toBe(indices[0] + row)) // contiguous, no row skipped
  return { fs: Number(header.get('fs')), firstIndex: indices[0], columns }
}

// Records `recordS` seconds of synthetic ECG + SCG starting `skipS` s after Start, with one marker in the middle.
async function recordSynthetic(ecgFs: number, scgFs: number, skipS: number, recordS: number) {
  const db = await openMonitorDb(`pipeline-${ecgFs}-${scgFs}`)
  const source = new SyntheticSource({
    heartRateBpm: HEART_RATE_BPM,
    rToAoS: R_TO_AO_S,
    ecgFs,
    scgFs,
    now: () => Date.now(),
  })
  const endIndex: Record<ChannelId, number> = { ecg: 0, scg: 0 }
  let recorder: Recorder | null = null
  source.onBlock((block) => {
    endIndex[block.channel] = block.firstSampleIndex + block.samples.length
    recorder?.push(block)
  })

  await source.start()
  vi.advanceTimersByTime(skipS * 1000)
  // As session.ts does on Record: each channel from its next sample on.
  recorder = new Recorder({
    db: Promise.resolve(db),
    draft: {
      name: 'session_test',
      startIso: '2026-10-08T13:00:00.000Z',
      recordedAtIso: '2026-10-08T13:00:02.000Z',
      source: 'synthetic',
      description: 'test',
      settings: {},
      channels: [
        { id: 'ecg', fs: ecgFs, firstSampleIndex: endIndex.ecg, sampleCount: 0 },
        { id: 'scg', fs: scgFs, firstSampleIndex: endIndex.scg, sampleCount: 0 },
      ],
      markers: [],
      status: 'recording',
    },
    onError: (message) => {
      throw new Error(message)
    },
  })
  vi.advanceTimersByTime((recordS / 2) * 1000)
  const reference: ChannelId = scgFs > ecgFs ? 'scg' : 'ecg'
  const marker = { channel: reference, sampleIndex: endIndex[reference] - 1, label: 'stand up' }
  recorder.addMarker(marker)
  vi.advanceTimersByTime((recordS / 2) * 1000)
  source.stop()
  await recorder.finish()

  const [session] = await listSavedSessions(db)
  const channels = await Promise.all(
    session.channels.map(async (c) => ({
      id: c.id,
      fs: c.fs,
      firstSampleIndex: c.firstSampleIndex,
      samples: await loadChannelSamples(db, session.id, c),
    })),
  )
  db.close()
  const files = buildCsvExport(session, channels).map((file) =>
    readCsv(Array.from(file.parts).join('')),
  )
  return { files, marker }
}

// Number of exported samples that differ from the synthetic model at t = sample_index / fs. Without noise the
// source computes exactly these values, so a sample lost, repeated or at the wrong index would not match.
function countWrongSamples(
  table: CsvTable,
  column: string,
  signalAt: (t: number) => number,
): number {
  let wrong = 0
  table.columns.get(column)!.forEach((cell, row) => {
    const expected = Math.fround(signalAt((table.firstIndex + row) / table.fs))
    if (cell === '' || Math.fround(Number(cell)) !== expected) wrong++
  })
  return wrong
}

const ecgModel = (t: number) => ecgAt(t, HEART_RATE_BPM)
const scgModel = (t: number) => scgAt(t, HEART_RATE_BPM, R_TO_AO_S)

beforeEach(() => {
  // Only the source's timer and clock are faked: fake-indexeddb needs the real setImmediate/setTimeout.
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('recording → CSV export → read back (M4)', () => {
  it('same fs: one file, every sample and the marker at the right index', async () => {
    const { files, marker } = await recordSynthetic(3000, 3000, 2, 60)

    expect(files).toHaveLength(1)
    const [table] = files
    expect(table.firstIndex).toBe(6000) // recording started 2 s after Start: the index is never re-based
    expect(table.columns.get('ecg_V')).toHaveLength(60 * 3000)
    expect(countWrongSamples(table, 'ecg_V', ecgModel)).toBe(0)
    expect(countWrongSamples(table, 'scg_V', scgModel)).toBe(0)
    const markerRows = table.columns.get('marker')!.flatMap((cell, row) => (cell ? [row] : []))
    expect(markerRows.map((row) => row + table.firstIndex)).toEqual([marker.sampleIndex])
  })

  it('different fs: one file per channel, the marker at round(t × fs) in the other one', async () => {
    const { files, marker } = await recordSynthetic(500, 3000, 1, 30)

    expect(files.map((f) => f.fs)).toEqual([500, 3000])
    const [ecg, scg] = files
    expect(ecg.firstIndex).toBe(500)
    expect(scg.firstIndex).toBe(3000) // the same instant (1 s) on both clocks
    expect(countWrongSamples(ecg, 'ecg_V', ecgModel)).toBe(0)
    expect(countWrongSamples(scg, 'scg_V', scgModel)).toBe(0)
    const markerIndex = (table: CsvTable) =>
      table.columns.get('marker')!.findIndex((cell) => cell === 'stand up') + table.firstIndex
    expect(markerIndex(scg)).toBe(marker.sampleIndex)
    expect(markerIndex(ecg)).toBe(Math.round((marker.sampleIndex / 3000) * 500))
  })
})
