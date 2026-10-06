# src/core – shared contracts

Everything else in the app depends on the types defined here. Change them rarely and deliberately.

## Contracts
Each channel has its **own sample rate and its own sample index** (ADR `docs/decisions/0003-per-channel-sample-rate.md`).
ECG and SCG may run at different rates (e.g. 512 Hz and 3000 Hz) or at the same rate. The code must handle both.

```ts
type ChannelId = 'ecg' | 'scg';

interface SampleBlock {
  channel: ChannelId;        // one channel per block
  seq: number;               // per-channel block counter from the source (gaps = lost data)
  firstSampleIndex: number;  // index of samples[0] on this channel's sample clock
  fs: number;                // samples per second of this channel (3000 for the current lab data)
  samples: Float32Array;     // values in volts
}

interface ChannelInfo { id: ChannelId; fs: number; }

interface DataSourceInfo { name: string; channels: ChannelInfo[]; units: 'V'; }

type SourceState =
  | 'idle'          // created or stopped; no session
  | 'connecting'    // start() called: loading a file or connecting over BLE
  | 'running'       // emitting blocks
  | 'reconnecting'  // BLE link lost, retrying (no blocks, same session)
  | 'ended'         // file finished and looping is off (no blocks, same session)
  | 'error';        // fatal for this session; start() again opens a new session

interface LinkQuality {        // BLE only (later also packetized synthetic); all channels together
  packetsReceived: number;     // since session start
  packetsLost: number;         // since session start, detected from per-channel seq gaps
  lossPercent: number;         // lost / expected over the last 10 s, 0–100
}

interface SourceStatus {
  state: SourceState;
  error?: string;              // human-readable message, set only when state is 'error' or 'reconnecting'
  linkQuality?: LinkQuality;   // undefined for sources without a radio link
}

interface DataSource {
  readonly info: DataSourceInfo;
  readonly status: SourceStatus;                            // current status, readable at any time
  start(): Promise<void>;                                   // opens a new session; resolves when 'running'
  stop(): void;                                             // closes the session; synchronous; idempotent
  onBlock(cb: (block: SampleBlock) => void): () => void;    // returns unsubscribe
  onStatus(cb: (status: SourceStatus) => void): () => void; // returns unsubscribe
}
```

Time helpers (in `src/core/time.ts`, with tests):
```ts
sampleIndexToSeconds(index: number, fs: number): number  // index / fs
secondsToSampleIndex(t: number, fs: number): number      // Math.round(t * fs)
```

## Rules
- **Time = sample index.** Never use `Date.now()` / `performance.now()` to timestamp samples.
  Wall-clock time is only for pacing (replay) and for the session start time in exports.
- `t = sampleIndex / fs` of **that channel**. Never compare sample indices of two different channels directly:
  convert to seconds first (or use `secondsToSampleIndex`).
- **Index 0 of every channel is the same instant** (session start). This is what keeps ECG and SCG aligned.
  A source that cannot guarantee it must correct the offset itself (see open question Q9).
- A block's `fs` never changes during a session. A source with a different fs is a new session.
- Values are stored in **volts**. Conversion to mV happens only at display time.
- `RingBuffer` is per channel and preallocated (`Float32Array`, default 30 s × that channel's fs). `push()` must not
  allocate. It must handle wrap-around and expose a way to read the last N samples into a caller-provided array.
- Missing samples (e.g. lost BLE packets) are written as `NaN`, never skipped. This keeps the index continuous.
- If you change an interface here, update `docs/architecture.md` and every implementation in `src/sources/`.

## Source lifecycle and sessions
Decision record: `docs/decisions/0002-source-status-and-sessions.md`.

```
idle ──start()──▶ connecting ──▶ running ──▶ ended          (file over, loop off)
                      │            │  ▲
                      ▼            ▼  │
                    error ◀── reconnecting                  (BLE only, max 5 attempts)
any state ──stop()──▶ idle
```
- **Session** = everything between `start()` and `stop()` (or `error`). A session has one source, one
  sample clock per channel, and at most one recording.
- **Every channel's sample index starts at 0 at every `start()`** (index 0 = session start, same instant
  for all channels) and only grows during the session (also across loops and BLE reconnects).
  Stopping or switching source ends the session: the app clears the ring buffers, resets DSP filter state
  and closes any open recording.
  A recording never spans two sessions, so its sample index is always unambiguous.
- **No pause in `DataSource`.** The patch cannot be paused, so neither can a source.
  The UI "Pause" button only **freezes the display**; acquisition, DSP and recording keep running.
  Resuming the display jumps back to live.
- `start()` while `connecting`/`running`/`reconnecting` is a no-op (never two timers or two connections).
  `start()` rejects if the session fails to open; in that case the status is also `'error'`.
- After `stop()` returns, no more `onBlock` or `onStatus` calls happen (except the single `'idle'` status).
- `onStatus` fires on every state change. `linkQuality` updates are throttled to **at most once per second**.
  Status is for the UI, never for the sample path.
- **Reconnect (BLE):** same session, same clocks. Samples missed while `reconnecting` are written as `NaN`,
  per channel, using that channel's device `firstSampleIndex` to compute the gap (see `docs/questions-for-team.md` #7 for
  device counter resets). After 5 failed attempts the state becomes `'error'`.
- **`ended`:** the session stays open (an open recording can still be stopped normally), no more blocks
  arrive, and the plot keeps showing the last data.
  `ReplaySource` loops by default, so it only reaches `ended` with looping turned off.
