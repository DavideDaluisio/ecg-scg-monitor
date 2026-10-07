# src/core – shared contracts

Everything else in the app depends on the types defined here. Change them rarely and deliberately.
If you change an interface, update `docs/architecture.md` and every implementation in `src/sources/`.

## Contracts (`types.ts`)

```ts
type ChannelId = 'ecg' | 'scg'

interface SampleBlock {
  channel: ChannelId // one channel per block
  seq: number // per-channel block counter from the source (a gap = lost data)
  firstSampleIndex: number // index of samples[0] on this channel's sample clock
  fs: number // samples per second of this channel (3000 for the current lab data)
  samples: Float32Array // values in volts
}

interface ChannelInfo {
  id: ChannelId
  fs: number
}

type SourceState = 'idle' | 'connecting' | 'running' | 'reconnecting' | 'ended' | 'error'

interface SourceStatus {
  state: SourceState
  error?: string // human-readable, only for 'error' and 'reconnecting'
}

interface DataSource {
  readonly name: string
  readonly channels: ChannelInfo[]
  readonly status: SourceStatus
  start(): Promise<void> // opens a new session; resolves when 'running'
  stop(): void // closes the session; synchronous; idempotent
  onBlock(cb: (block: SampleBlock) => void): () => void // returns unsubscribe
  onStatus(cb: (status: SourceStatus) => void): () => void // returns unsubscribe
}
```

Time helpers (`time.ts`): `sampleIndexToSeconds(index, fs)` = `index / fs`,
`secondsToSampleIndex(t, fs)` = `Math.round(t * fs)`.

## Rules

- **Time = sample index.** Never timestamp samples with `Date.now()` / `performance.now()`.
  Wall-clock time is only for pacing (replay) and for the session start time in exports.
- Never compare sample indices of two different channels directly: convert to seconds first.
- **Index 0 of every channel is the same instant** (session start).
- A channel's `fs` never changes during a session. A different `fs` means a new session.
- Values are stored in **volts**. Conversion to mV happens only at display time.
- `RingBuffer` (`ringBuffer.ts`) is per channel and preallocated (30 s × fs in `src/state/session.ts`).
  `push()` and `copyRange()` must not allocate (no `subarray()` either). API:
  - `push(firstSampleIndex, samples)`: writes a block with wrap-around. A gap before `firstSampleIndex` is filled
    with `NaN`; samples already written (overlap) are ignored; a block longer than the capacity keeps its tail.
  - `endIndex` (one past the newest sample) and `startIndex` (oldest sample still held).
  - `copyRange(startIndex, out)`: fills the caller's array; samples too old or not written yet become `NaN`.
- Missing samples are written as `NaN`, never skipped, so the index stays continuous.

## Source lifecycle

```
idle ──start()──▶ connecting ──▶ running ──▶ ended         (file over, loop off)
                      │            │  ▲
                      ▼            ▼  │
                    error ◀── reconnecting                 (BLE only)
any state ──stop()──▶ idle
```

- A **session** is everything between `start()` and `stop()` (or `error`). Every `start()` restarts all indices at 0.
- There is **no pause** in `DataSource` (the patch cannot be paused). UI "Pause" only freezes the display.
- `start()` while `connecting`/`running`/`reconnecting` is a no-op. After `stop()` returns, no more `onBlock` calls.
