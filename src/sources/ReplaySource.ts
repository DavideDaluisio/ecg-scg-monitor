// Replays recorded signals (one track per channel) at real speed, looping by default.
// Rules: src/sources/CLAUDE.md.
import type {
  ChannelId,
  ChannelInfo,
  DataSource,
  SampleBlock,
  SourceStatus,
} from '../core/types.ts'
import { Pacer } from './pacer.ts'

/** One recording played on one channel. */
export interface ReplayTrack {
  channel: ChannelId
  fs: number
  samples: Float32Array // volts, the whole file
}

export interface ReplayOptions {
  name: string
  // All tracks start at the same instant, so sample index 0 of every channel is the same moment.
  tracks: ReplayTrack[]
  loop?: boolean // default true; each track loops on its own length
  // Wall clock in milliseconds, used for pacing only (never as a sample timestamp). Tests pass Date.now with fake timers.
  now?: () => number
}

const TICK_MS = 20

// A track plus how far it has been played in the current session.
interface TrackState extends ReplayTrack {
  emitted: number // samples emitted since start() (= next sample index)
  seq: number
}

export class ReplaySource implements DataSource {
  readonly name: string
  readonly channels: ChannelInfo[]
  status: SourceStatus = { state: 'idle' }

  private readonly tracks: TrackState[]
  private readonly loop: boolean
  private readonly pacer: Pacer

  private blockListeners = new Set<(block: SampleBlock) => void>()
  private statusListeners = new Set<(status: SourceStatus) => void>()
  private timer: ReturnType<typeof setInterval> | null = null

  constructor(options: ReplayOptions) {
    if (options.tracks.length === 0) throw new Error('Replay needs at least one track')
    for (const track of options.tracks) {
      if (track.samples.length === 0) throw new Error('Replay needs at least one sample per track')
      if (options.tracks.filter((t) => t.channel === track.channel).length > 1) {
        throw new Error(`Replay has two tracks for the ${track.channel.toUpperCase()} channel`)
      }
    }
    this.name = options.name
    this.tracks = options.tracks.map((track) => ({ ...track, emitted: 0, seq: 0 }))
    this.loop = options.loop ?? true
    this.pacer = new Pacer(options.now ?? (() => performance.now()))
    this.channels = options.tracks.map((track) => ({ id: track.channel, fs: track.fs }))
  }

  async start(): Promise<void> {
    const state = this.status.state
    if (state === 'connecting' || state === 'running' || state === 'reconnecting') return

    this.setStatus({ state: 'connecting' })
    // Every session restarts the sample index and seq of every channel at 0.
    for (const track of this.tracks) {
      track.emitted = 0
      track.seq = 0
    }
    this.pacer.start()
    this.timer = setInterval(() => this.tick(), TICK_MS)
    this.setStatus({ state: 'running' })
  }

  stop(): void {
    this.clearTimer()
    if (this.status.state !== 'idle') this.setStatus({ state: 'idle' })
  }

  onBlock(cb: (block: SampleBlock) => void): () => void {
    this.blockListeners.add(cb)
    return () => this.blockListeners.delete(cb)
  }

  onStatus(cb: (status: SourceStatus) => void): () => void {
    this.statusListeners.add(cb)
    return () => this.statusListeners.delete(cb)
  }

  private tick(): void {
    // Drift compensation: emit the samples that should exist by now, not a fixed number per tick.
    const elapsedS = this.pacer.elapsedSeconds()
    let allEnded = true
    for (const track of this.tracks) {
      let due = Math.floor(elapsedS * track.fs)
      if (!this.loop) due = Math.min(due, track.samples.length)
      this.emitUpTo(track, due)
      if (this.timer === null) return // a listener called stop(): no blocks after stop()
      if (this.loop || track.emitted < track.samples.length) allEnded = false
    }

    if (allEnded) {
      this.clearTimer()
      this.setStatus({ state: 'ended' })
    }
  }

  // Emits samples [emitted, due) of one track as views on the file (no copy). A block never crosses the end of
  // the file: at the loop point it is split in two.
  private emitUpTo(track: TrackState, due: number): void {
    const length = track.samples.length
    while (track.emitted < due) {
      const position = track.emitted % length
      const count = Math.min(due - track.emitted, length - position)
      const block: SampleBlock = {
        channel: track.channel,
        seq: track.seq++,
        firstSampleIndex: track.emitted,
        fs: track.fs,
        samples: track.samples.subarray(position, position + count),
      }
      track.emitted += count
      for (const listener of this.blockListeners) {
        listener(block)
        if (this.timer === null) return // a listener called stop()
      }
    }
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  private setStatus(status: SourceStatus): void {
    this.status = status
    for (const listener of this.statusListeners) listener(status)
  }
}
