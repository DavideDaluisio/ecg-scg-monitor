// Shared contracts. Everything else in the app depends on these types: change them rarely and deliberately
// (see src/core/CLAUDE.md and docs/architecture.md).

export type ChannelId = 'ecg' | 'scg'

export interface SampleBlock {
  channel: ChannelId // one channel per block
  seq: number // per-channel block counter from the source (a gap = lost data)
  firstSampleIndex: number // index of samples[0] on this channel's sample clock
  fs: number // samples per second of this channel
  samples: Float32Array // values in volts; read-only for consumers (it may be a view on the source's data)
}

export interface ChannelInfo {
  id: ChannelId
  fs: number
}

export type SourceState = 'idle' | 'connecting' | 'running' | 'reconnecting' | 'ended' | 'error'

export interface SourceStatus {
  state: SourceState
  error?: string // human-readable, only for 'error' and 'reconnecting'
}

export interface DataSource {
  readonly name: string
  readonly channels: ChannelInfo[]
  readonly status: SourceStatus
  start(): Promise<void> // opens a new session; resolves when 'running'
  stop(): void // closes the session; synchronous; idempotent
  onBlock(cb: (block: SampleBlock) => void): () => void // returns unsubscribe
  onStatus(cb: (status: SourceStatus) => void): () => void // returns unsubscribe
}
