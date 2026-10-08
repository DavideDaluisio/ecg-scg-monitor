// Generates ECG + SCG in real time with a known heart rate and R→AO delay (model: syntheticSignals.ts).
// Used to check that the two panels stay aligned, and as a demo when no recording is at hand.
// Rules: src/sources/CLAUDE.md.
import type {
  ChannelId,
  ChannelInfo,
  DataSource,
  SampleBlock,
  SourceStatus,
} from '../core/types.ts'
import { Pacer } from './pacer.ts'
import { createGaussianNoise, ecgAt, scgAt } from './syntheticSignals.ts'

export interface SyntheticOptions {
  heartRateBpm: number
  rToAoS: number // delay from the ECG R peak to the SCG AO peak
  ecgFs: number
  scgFs: number
  noise?: boolean // default false: without noise the delay can be read to the sample
  seed?: number // default 1; the same seed always gives the same noise
  // Wall clock in milliseconds, used for pacing only (never as a sample timestamp). Tests pass Date.now with fake timers.
  now?: () => number
}

// Accepted settings (the UI form uses the same limits).
export const HEART_RATE_RANGE_BPM = { min: 30, max: 200 }
export const R_TO_AO_RANGE_S = { min: 0, max: 0.3 }

// About 1 % of the R peak and of the AO peak.
const ECG_NOISE_RMS_V = 10e-6
const SCG_NOISE_RMS_V = 0.5e-3
const TICK_MS = 20

// One generated channel plus how far it has been emitted in the current session.
interface SyntheticChannel {
  id: ChannelId
  fs: number
  signalAt: (t: number) => number // volts, without noise
  noiseRmsV: number
  noiseSeed: number
  noise: () => number // recreated by start(), so every session gives the same samples
  emitted: number // samples emitted since start() (= next sample index)
  seq: number
}

export class SyntheticSource implements DataSource {
  readonly name = 'synthetic'
  readonly channels: ChannelInfo[]
  status: SourceStatus = { state: 'idle' }

  private readonly signals: SyntheticChannel[]
  private readonly pacer: Pacer

  private blockListeners = new Set<(block: SampleBlock) => void>()
  private statusListeners = new Set<(status: SourceStatus) => void>()
  private timer: ReturnType<typeof setInterval> | null = null

  constructor(options: SyntheticOptions) {
    validateOptions(options)
    const { heartRateBpm, rToAoS } = options
    const noise = options.noise ?? false
    const seed = options.seed ?? 1
    this.signals = [
      {
        id: 'ecg',
        fs: options.ecgFs,
        signalAt: (t) => ecgAt(t, heartRateBpm),
        noiseRmsV: noise ? ECG_NOISE_RMS_V : 0,
        noiseSeed: seed,
        noise: () => 0,
        emitted: 0,
        seq: 0,
      },
      {
        id: 'scg',
        fs: options.scgFs,
        signalAt: (t) => scgAt(t, heartRateBpm, rToAoS),
        noiseRmsV: noise ? SCG_NOISE_RMS_V : 0,
        noiseSeed: seed + 1, // independent noise on the two channels
        noise: () => 0,
        emitted: 0,
        seq: 0,
      },
    ]
    this.channels = this.signals.map((signal) => ({ id: signal.id, fs: signal.fs }))
    this.pacer = new Pacer(options.now ?? (() => performance.now()))
  }

  async start(): Promise<void> {
    const state = this.status.state
    if (state === 'connecting' || state === 'running' || state === 'reconnecting') return

    this.setStatus({ state: 'connecting' })
    // Every session restarts the sample index, seq and noise of every channel.
    for (const signal of this.signals) {
      signal.emitted = 0
      signal.seq = 0
      signal.noise = createGaussianNoise(signal.noiseSeed, signal.noiseRmsV)
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
    // Same pacing as the replay: every channel emits the samples that should exist by now.
    const elapsedS = this.pacer.elapsedSeconds()
    for (const signal of this.signals) {
      this.emitUpTo(signal, Math.floor(elapsedS * signal.fs))
      if (this.timer === null) return // a listener called stop(): no blocks after stop()
    }
  }

  private emitUpTo(signal: SyntheticChannel, due: number): void {
    const count = due - signal.emitted
    if (count <= 0) return
    // A new array for every block (about 50 per second per channel): consumers may keep it (recorder, M4).
    const samples = new Float32Array(count)
    for (let i = 0; i < count; i++) {
      samples[i] = signal.signalAt((signal.emitted + i) / signal.fs) + signal.noise()
    }
    const block: SampleBlock = {
      channel: signal.id,
      seq: signal.seq++,
      firstSampleIndex: signal.emitted,
      fs: signal.fs,
      samples,
    }
    signal.emitted += count
    for (const listener of this.blockListeners) {
      listener(block)
      if (this.timer === null) return // a listener called stop()
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

// Throws a message the UI can show as is.
function validateOptions(options: SyntheticOptions): void {
  const { heartRateBpm, rToAoS, ecgFs, scgFs } = options
  if (!(heartRateBpm >= HEART_RATE_RANGE_BPM.min && heartRateBpm <= HEART_RATE_RANGE_BPM.max)) {
    throw new Error(
      `Heart rate must be between ${HEART_RATE_RANGE_BPM.min} and ${HEART_RATE_RANGE_BPM.max} bpm`,
    )
  }
  if (!(rToAoS >= R_TO_AO_RANGE_S.min && rToAoS <= R_TO_AO_RANGE_S.max)) {
    throw new Error(
      `R→AO delay must be between ${R_TO_AO_RANGE_S.min * 1000} and ${R_TO_AO_RANGE_S.max * 1000} ms`,
    )
  }
  for (const fs of [ecgFs, scgFs]) {
    if (!Number.isInteger(fs) || fs <= 0) {
      throw new Error(`Sampling rate must be a positive whole number of Hz, got ${fs}`)
    }
  }
}
