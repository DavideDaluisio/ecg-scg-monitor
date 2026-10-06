# src/sources – data sources

Every source implements `DataSource` from `src/core`. The rest of the app must not know which source is active.
Every source follows the lifecycle in `src/core/CLAUDE.md` (status states, sessions, no pause):
- `firstSampleIndex` is 0 for the first block of each channel after `start()` and contiguous after that.
- Emit `onStatus` on every state change. Never emit blocks outside `'running'`.

## ReplaySource (M1–M2)
- Plays a recording from `public/samples/` (parsed by `src/io`) **at real speed**, looping at the end.
- `info.channels` takes the fs from the file (e.g. `[{ id: 'ecg', fs: 3000 }]`). Never assume 3000.
- Emits blocks of about 20 ms (`round(0.02 × fs)` samples, 60 at 3 kHz) using a timer.
- Timers drift: on each tick, compute how many samples *should* have been emitted since `start()`
  (from elapsed wall-clock time × fs) and emit exactly the missing ones. Never assume each tick is exactly 20 ms.
- When looping, `firstSampleIndex` keeps increasing. The clock never resets within a session.
- Status: `connecting` while fetching/parsing the file, then `running`. Fetch/parse failure → `error` with a message.
  With looping turned off, the end of the file → `ended`.
- Replaying ECG and SCG files together is allowed but they are **not simultaneous recordings**. Label this in the UI.

## SyntheticSource (M3)
- Generates **simultaneous** ECG + SCG with known ground truth, used to test the combined view and HR.
- ECG: PQRST built from Gaussians (McSharry-style), HR configurable (default 72 bpm), DC offset and noise optional.
- SCG: AO/AC complex placed a configurable delay after each R peak (default 60 ms), amplitude about ±20 mV.
- Parameters (`hrBpm`, `rToAoMs`, `noiseRms`, `fsEcg`, `fsScg`) are exposed so tests can assert detected HR and delay.
  Defaults: both 3000 Hz. Tests must also cover **different rates** (e.g. `fsEcg: 512`, `fsScg: 3000`), as on the
  paper's patch (MAX30003 + ADXL355).
- Emits one block per channel per tick. Both channels start at index 0 at the same instant.
- Must be deterministic when given a seed (use a small seeded PRNG, not `Math.random`).
- M6: a "packetized" mode encodes blocks with `src/ble/encoder` and decodes them back, to test the BLE path without hardware.

## BleSource (M6)
- Wraps `src/ble` (connection + decoder). Converts decoded packets into `SampleBlock`s.
- Session index of a channel = device `firstSampleIndex` − device index of that channel's first packet in this session.
- Status: `connecting` → `running`; on `gattserverdisconnected` → `reconnecting` (backoff, max 5) → `running` or `error`.
  `linkQuality` comes from the decoder's `seq` tracking and is published at most once per second.
- Per-channel fs comes from the `INFO` characteristic, never hard-coded.

## Adding a source
Use the skill `add-data-source`.
