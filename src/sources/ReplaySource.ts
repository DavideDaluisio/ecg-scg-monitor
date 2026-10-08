// Replays a recorded signal (one channel) at real speed, looping by default. Rules: src/sources/CLAUDE.md.
import type {
  ChannelId,
  ChannelInfo,
  DataSource,
  SampleBlock,
  SourceStatus,
} from '../core/types.ts'

export interface ReplayOptions {
  name: string
  channel: ChannelId
  fs: number
  samples: Float32Array // volts, the whole file
  loop?: boolean // default true
  // Wall clock in milliseconds, used for pacing only (never as a sample timestamp). Tests pass Date.now with fake timers.
  now?: () => number
}

const TICK_MS = 20
// At most 1 s of samples per tick. Browsers slow down timers in background tabs; when the tab comes back,
// the replay continues from where it was instead of emitting a huge burst.
const MAX_CATCH_UP_S = 1

export class ReplaySource implements DataSource {
  readonly name: string
  readonly channels: ChannelInfo[]
  status: SourceStatus = { state: 'idle' }

  private readonly channel: ChannelId
  private readonly fs: number
  private readonly fileSamples: Float32Array
  private readonly loop: boolean
  private readonly now: () => number

  private blockListeners = new Set<(block: SampleBlock) => void>()
  private statusListeners = new Set<(status: SourceStatus) => void>()
  private timer: ReturnType<typeof setInterval> | null = null
  private startTimeMs = 0 // wall-clock instant that corresponds to sample index 0
  private emitted = 0 // samples emitted since start() (= next sample index)
  private seq = 0

  constructor(options: ReplayOptions) {
    if (options.samples.length === 0) throw new Error('Replay needs at least one sample')
    this.name = options.name
    this.channel = options.channel
    this.fs = options.fs
    this.fileSamples = options.samples
    this.loop = options.loop ?? true
    this.now = options.now ?? (() => performance.now())
    this.channels = [{ id: options.channel, fs: options.fs }]
  }

  async start(): Promise<void> {
    const state = this.status.state
    if (state === 'connecting' || state === 'running' || state === 'reconnecting') return

    this.setStatus({ state: 'connecting' })
    // Every session restarts the sample index and seq at 0.
    this.emitted = 0
    this.seq = 0
    this.startTimeMs = this.now()
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
    const elapsedS = (this.now() - this.startTimeMs) / 1000
    let due = Math.floor(elapsedS * this.fs)

    const maxPerTick = MAX_CATCH_UP_S * this.fs
    if (due - this.emitted > maxPerTick) {
      const skippedS = (due - this.emitted - maxPerTick) / this.fs
      console.info(
        `Replay fell behind by ${skippedS.toFixed(1)} s (tab in background?), continuing from here`,
      )
      due = this.emitted + maxPerTick
      // Move the start instant so that "now" corresponds to `due`: the replay pauses instead of skipping samples.
      this.startTimeMs = this.now() - (due / this.fs) * 1000
    }

    if (!this.loop) due = Math.min(due, this.fileSamples.length)
    this.emitUpTo(due)

    if (!this.loop && this.emitted >= this.fileSamples.length) {
      this.clearTimer()
      this.setStatus({ state: 'ended' })
    }
  }

  // Emits samples [emitted, due) as views on the file (no copy). A block never crosses the end of the file:
  // at the loop point it is split in two.
  private emitUpTo(due: number): void {
    const length = this.fileSamples.length
    while (this.emitted < due) {
      const position = this.emitted % length
      const count = Math.min(due - this.emitted, length - position)
      const block: SampleBlock = {
        channel: this.channel,
        seq: this.seq++,
        firstSampleIndex: this.emitted,
        fs: this.fs,
        samples: this.fileSamples.subarray(position, position + count),
      }
      this.emitted += count
      for (const listener of this.blockListeners) {
        listener(block)
        // A listener may have called stop(): no blocks after stop().
        if (this.timer === null) return
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
