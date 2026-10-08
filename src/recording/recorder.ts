// Saves the raw samples and markers of a live session to IndexedDB, from Record to Stop recording.
// Rules: src/recording/CLAUDE.md.
import type { ChannelId, SampleBlock } from '../core/types.ts'
import { ChannelChunker } from './chunker.ts'
import { createSavedSession, saveChunk, saveSessionMeta, type MonitorDb } from './db.ts'
import type { Marker, SavedSession } from './types.ts'

export interface RecorderOptions {
  // A promise, so the recorder can be created (and receive blocks) before the database is open.
  db: Promise<MonitorDb>
  // The new session without its id. Each channel's firstSampleIndex is where its recording starts.
  draft: Omit<SavedSession, 'id'>
  onError: (message: string) => void // called once if a write fails (e.g. no space left)
  chunkSeconds?: number // default 1
}

type DbTask = (db: MonitorDb, session: SavedSession) => Promise<void>

export class Recorder {
  private readonly chunkers = new Map<ChannelId, ChannelChunker>()
  private readonly onError: (message: string) => void
  // Set once the session is stored. Every later write goes through `writes`, so it happens after that.
  private stored: { db: MonitorDb; session: SavedSession } | null = null
  // The chain of pending writes: they run one after the other, in the order they were asked for.
  private writes: Promise<void>
  private finished = false
  private failed = false

  constructor(options: RecorderOptions) {
    const { draft } = options
    this.onError = options.onError
    const chunkSeconds = options.chunkSeconds ?? 1
    for (const channel of draft.channels) {
      const chunkLength = Math.max(1, Math.round(chunkSeconds * channel.fs))
      this.chunkers.set(
        channel.id,
        new ChannelChunker(channel.firstSampleIndex, chunkLength, (firstSampleIndex, samples) =>
          this.enqueue((db, session) =>
            this.writeChunk(db, session, channel.id, firstSampleIndex, samples),
          ),
        ),
      )
    }

    this.writes = options.db
      .then(async (db) => {
        const id = await createSavedSession(db, draft)
        this.stored = { db, session: { ...structuredClone(draft), id } }
      })
      .catch((error: unknown) => this.fail(error))
  }

  /** Records a block (hot path: copies the samples into the current chunk, no database call). */
  push(block: SampleBlock): void {
    if (this.finished || this.failed) return
    this.chunkers.get(block.channel)?.push(block.firstSampleIndex, block.samples)
  }

  addMarker(marker: Marker): void {
    if (this.finished || this.failed) return
    this.enqueue(async (db, session) => {
      session.markers.push(marker)
      await saveSessionMeta(db, session)
    })
  }

  /** Stores the last partial chunks, marks the session complete and waits until everything is written. */
  async finish(): Promise<void> {
    if (!this.finished) {
      this.finished = true
      for (const chunker of this.chunkers.values()) chunker.flush()
      this.enqueue(async (db, session) => {
        session.status = 'complete'
        await saveSessionMeta(db, session)
      })
    }
    await this.writes
  }

  private async writeChunk(
    db: MonitorDb,
    session: SavedSession,
    channel: ChannelId,
    firstSampleIndex: number,
    samples: Float32Array,
  ): Promise<void> {
    const savedChannel = session.channels.find((c) => c.id === channel)
    if (savedChannel === undefined) return
    savedChannel.sampleCount = firstSampleIndex + samples.length - savedChannel.firstSampleIndex
    await saveChunk(db, { sessionId: session.id, channel, firstSampleIndex, samples }, session)
  }

  private enqueue(task: DbTask): void {
    this.writes = this.writes.then(async () => {
      if (this.failed || this.stored === null) return
      try {
        await task(this.stored.db, this.stored.session)
      } catch (error) {
        this.fail(error)
      }
    })
  }

  private fail(error: unknown): void {
    if (this.failed) return
    this.failed = true
    const name = error instanceof Error ? error.name : ''
    const message = error instanceof Error ? error.message : String(error)
    this.onError(
      name === 'QuotaExceededError'
        ? 'Recording stopped: the browser has no space left for this session.'
        : `Recording stopped: ${message}`,
    )
  }
}
