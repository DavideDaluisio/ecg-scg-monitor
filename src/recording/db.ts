// IndexedDB storage of saved sessions (layout: docs/data-formats.md). Uses the `idb` wrapper (promises instead of
// IndexedDB events). Every function takes the database as argument, so tests can open their own.
import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { ChannelId } from '../core/types.ts'
import type { SampleChunk, SavedChannel, SavedSession } from './types.ts'

const DB_NAME = 'ecg-scg-monitor'
const DB_VERSION = 1

interface MonitorDbSchema extends DBSchema {
  sessions: { key: number; value: SavedSession }
  // Sorted by session, then channel, then sample index: reading a range gives a channel's chunks in order.
  chunks: { key: [number, ChannelId, number]; value: SampleChunk }
}

export type MonitorDb = IDBPDatabase<MonitorDbSchema>

export function openMonitorDb(name = DB_NAME): Promise<MonitorDb> {
  return openDB<MonitorDbSchema>(name, DB_VERSION, {
    upgrade(db) {
      db.createObjectStore('sessions', { keyPath: 'id', autoIncrement: true })
      db.createObjectStore('chunks', { keyPath: ['sessionId', 'channel', 'firstSampleIndex'] })
    },
  })
}

let appDb: Promise<MonitorDb> | null = null

/** The app's database, opened once. */
export function getAppDb(): Promise<MonitorDb> {
  appDb ??= openMonitorDb()
  return appDb
}

/** Stores a new session and returns its id. */
export function createSavedSession(
  db: MonitorDb,
  draft: Omit<SavedSession, 'id'>,
): Promise<number> {
  // IndexedDB fills in `id` (auto-increment key), so the draft has none yet.
  return db.add('sessions', draft as SavedSession)
}

/**
 * Stores a chunk and the session's updated description (sample counts) in one transaction: if the tab is closed
 * while recording, what is stored is still consistent.
 */
export async function saveChunk(
  db: MonitorDb,
  chunk: SampleChunk,
  session: SavedSession,
): Promise<void> {
  const tx = db.transaction(['chunks', 'sessions'], 'readwrite')
  void tx.objectStore('chunks').put(chunk)
  void tx.objectStore('sessions').put(session)
  await tx.done
}

export async function saveSessionMeta(db: MonitorDb, session: SavedSession): Promise<void> {
  await db.put('sessions', session)
}

/** All saved sessions, newest first. */
export async function listSavedSessions(db: MonitorDb): Promise<SavedSession[]> {
  const sessions = await db.getAll('sessions')
  return sessions.sort((a, b) => b.id - a.id)
}

/**
 * All samples of one recorded channel, from channel.firstSampleIndex on, in one array.
 * A missing chunk (should not happen) becomes NaN, so the following samples keep their index.
 */
export async function loadChannelSamples(
  db: MonitorDb,
  sessionId: number,
  channel: SavedChannel,
): Promise<Float32Array> {
  const chunks = await db.getAll('chunks', channelRange(sessionId, channel.id))
  if (chunks.length === 0) return new Float32Array(0)

  const last = chunks[chunks.length - 1]
  const length = last.firstSampleIndex + last.samples.length - channel.firstSampleIndex
  const samples = new Float32Array(length).fill(NaN)
  for (const chunk of chunks)
    samples.set(chunk.samples, chunk.firstSampleIndex - channel.firstSampleIndex)
  return samples
}

/** Deletes a session and all its samples. */
export async function deleteSavedSession(db: MonitorDb, session: SavedSession): Promise<void> {
  const tx = db.transaction(['chunks', 'sessions'], 'readwrite')
  for (const channel of session.channels) {
    void tx.objectStore('chunks').delete(channelRange(session.id, channel.id))
  }
  void tx.objectStore('sessions').delete(session.id)
  await tx.done
}

// Keys of every chunk of one channel of one session.
function channelRange(sessionId: number, channel: ChannelId): IDBKeyRange {
  return IDBKeyRange.bound([sessionId, channel, -Infinity], [sessionId, channel, Infinity])
}
