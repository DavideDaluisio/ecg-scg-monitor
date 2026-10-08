// IndexedDB storage and the recorder, on fake-indexeddb (Node has no IndexedDB). Each test opens its own database.
import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ChannelId, SampleBlock } from '../../src/core/types.ts'
import {
  createSavedSession,
  deleteSavedSession,
  listSavedSessions,
  loadChannelSamples,
  openMonitorDb,
  saveChunk,
  type MonitorDb,
} from '../../src/recording/db.ts'
import { Recorder } from '../../src/recording/recorder.ts'
import type { SavedSession } from '../../src/recording/types.ts'

let dbCount = 0
const openDbs: MonitorDb[] = []

async function freshDb(): Promise<MonitorDb> {
  const db = await openMonitorDb(`test-db-${++dbCount}`)
  openDbs.push(db)
  return db
}

afterEach(() => {
  for (const db of openDbs.splice(0)) db.close()
})

function draft(channels: { id: ChannelId; fs: number; first: number }[]): Omit<SavedSession, 'id'> {
  return {
    name: 'session_2026-10-08_15-04-05',
    startIso: '2026-10-08T13:04:00.000Z',
    recordedAtIso: '2026-10-08T13:04:05.000Z',
    source: 'synthetic',
    description: 'Synthetic ECG + SCG',
    settings: { synthetic_heart_rate_bpm: 72 },
    channels: channels.map(({ id, fs, first }) => ({
      id,
      fs,
      firstSampleIndex: first,
      sampleCount: 0,
    })),
    markers: [],
    status: 'recording',
  }
}

function block(channel: ChannelId, firstSampleIndex: number, values: number[]): SampleBlock {
  return { channel, seq: 0, firstSampleIndex, fs: 10, samples: Float32Array.from(values) }
}

describe('saved sessions in IndexedDB', () => {
  it('stores chunks and gives a channel back in one array, in order', async () => {
    const db = await freshDb()
    const id = await createSavedSession(db, draft([{ id: 'ecg', fs: 10, first: 50 }]))
    const session: SavedSession = { ...draft([{ id: 'ecg', fs: 10, first: 50 }]), id }
    // Stored out of order on purpose: the key keeps them sorted by sample index.
    await saveChunk(
      db,
      { sessionId: id, channel: 'ecg', firstSampleIndex: 53, samples: Float32Array.from([3, 4]) },
      session,
    )
    await saveChunk(
      db,
      {
        sessionId: id,
        channel: 'ecg',
        firstSampleIndex: 50,
        samples: Float32Array.from([0, 1, 2]),
      },
      session,
    )

    const samples = await loadChannelSamples(db, id, session.channels[0])
    expect(Array.from(samples)).toEqual([0, 1, 2, 3, 4])
  })

  it('fills a missing chunk with NaN so the following samples keep their index', async () => {
    const db = await freshDb()
    const session: SavedSession = { ...draft([{ id: 'scg', fs: 10, first: 0 }]), id: 0 }
    session.id = await createSavedSession(db, draft([{ id: 'scg', fs: 10, first: 0 }]))
    await saveChunk(
      db,
      {
        sessionId: session.id,
        channel: 'scg',
        firstSampleIndex: 0,
        samples: Float32Array.from([1, 2]),
      },
      session,
    )
    await saveChunk(
      db,
      {
        sessionId: session.id,
        channel: 'scg',
        firstSampleIndex: 4,
        samples: Float32Array.from([5]),
      },
      session,
    )

    const samples = await loadChannelSamples(db, session.id, session.channels[0])
    expect(Array.from(samples)).toEqual([1, 2, NaN, NaN, 5])
  })

  it('lists the newest session first and deletes a session with all its chunks', async () => {
    const db = await freshDb()
    const firstId = await createSavedSession(db, draft([{ id: 'ecg', fs: 10, first: 0 }]))
    const secondId = await createSavedSession(db, draft([{ id: 'ecg', fs: 10, first: 0 }]))
    const second: SavedSession = { ...draft([{ id: 'ecg', fs: 10, first: 0 }]), id: secondId }
    await saveChunk(
      db,
      { sessionId: firstId, channel: 'ecg', firstSampleIndex: 0, samples: Float32Array.from([1]) },
      { ...second, id: firstId },
    )
    await saveChunk(
      db,
      { sessionId: secondId, channel: 'ecg', firstSampleIndex: 0, samples: Float32Array.from([2]) },
      second,
    )

    expect((await listSavedSessions(db)).map((s) => s.id)).toEqual([secondId, firstId])

    await deleteSavedSession(db, second)
    expect((await listSavedSessions(db)).map((s) => s.id)).toEqual([firstId])
    expect(await db.count('chunks')).toBe(1) // only the first session's chunk is left
  })
})

describe('Recorder', () => {
  it('saves the blocks from the start index on, with markers, and completes the session', async () => {
    const db = await freshDb()
    const recorder = new Recorder({
      db: Promise.resolve(db),
      draft: draft([
        { id: 'ecg', fs: 10, first: 3 },
        { id: 'scg', fs: 10, first: 3 },
      ]),
      onError: () => {},
      chunkSeconds: 0.4, // 4 samples per chunk at 10 Hz
    })
    // Blocks arrive before the database has stored the session: none may be lost.
    recorder.push(block('ecg', 0, [0, 1, 2, 3, 4, 5]))
    recorder.push(block('scg', 0, [0, -1, -2, -3, -4, -5]))
    recorder.addMarker({ channel: 'ecg', sampleIndex: 4, label: 'stand up' })
    recorder.push(block('ecg', 6, [6, 7, 8, 9, 10]))
    recorder.push(block('scg', 8, [-8])) // scg samples 6 and 7 lost
    await recorder.finish()

    const [session] = await listSavedSessions(db)
    expect(session.status).toBe('complete')
    expect(session.markers).toEqual([{ channel: 'ecg', sampleIndex: 4, label: 'stand up' }])
    expect(session.channels).toEqual([
      { id: 'ecg', fs: 10, firstSampleIndex: 3, sampleCount: 8 },
      { id: 'scg', fs: 10, firstSampleIndex: 3, sampleCount: 6 },
    ])
    const ecg = await loadChannelSamples(db, session.id, session.channels[0])
    const scg = await loadChannelSamples(db, session.id, session.channels[1])
    expect(Array.from(ecg)).toEqual([3, 4, 5, 6, 7, 8, 9, 10])
    expect(Array.from(scg)).toEqual([-3, -4, -5, NaN, NaN, -8])
  })

  it('leaves a usable session when it is never finished (tab closed while recording)', async () => {
    const db = await freshDb()
    const recorder = new Recorder({
      db: Promise.resolve(db),
      draft: draft([{ id: 'ecg', fs: 10, first: 0 }]),
      onError: () => {},
      chunkSeconds: 0.2, // 2 samples per chunk
    })
    recorder.push(block('ecg', 0, [1, 2, 3, 4, 5])) // two full chunks, one sample still in memory
    await vi.waitFor(async () => expect(await db.count('chunks')).toBe(2))

    const [session] = await listSavedSessions(db)
    expect(session.status).toBe('recording')
    expect(session.channels[0].sampleCount).toBe(4)
    expect(Array.from(await loadChannelSamples(db, session.id, session.channels[0]))).toEqual([
      1, 2, 3, 4,
    ])
  })

  it('reports a failed write once and stops recording', async () => {
    const db = await freshDb()
    const errors: string[] = []
    const recorder = new Recorder({
      db: Promise.resolve(db),
      draft: draft([{ id: 'ecg', fs: 10, first: 0 }]),
      onError: (message) => errors.push(message),
      chunkSeconds: 0.1,
    })
    await vi.waitFor(async () => expect(await db.count('sessions')).toBe(1))
    const quota = new DOMException('The quota has been exceeded.', 'QuotaExceededError')
    vi.spyOn(db, 'transaction').mockImplementation(() => {
      throw quota
    })
    recorder.push(block('ecg', 0, [1, 2, 3]))
    await recorder.finish()

    expect(errors).toEqual(['Recording stopped: the browser has no space left for this session.'])
  })
})
