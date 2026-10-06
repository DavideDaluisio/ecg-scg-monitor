# Architecture

## Data flow
```
DataSource (Replay | Synthetic | BLE) ── onStatus ──▶ UI status badge (state, error, link quality)
        │  SampleBlock { channel, seq, firstSampleIndex, fs, samples }   (one channel per block)
        ▼
Acquisition store ── raw ring buffers (30 s per channel, own fs, sample index = clock)
        │                         │
        ▼                         ▼
DSP Web Worker               Recorder (IndexedDB chunks + markers) ──▶ Export CSV / LVM
(filters, R-peak/HR)
        │  filtered blocks + HR events
        ▼
Filtered ring buffers ──▶ Plot (uPlot, min/max decimation, one rAF loop, 60 fps)
                          UI (React + zustand): source picker, start/stop, markers, HR badge, settings
```

## Key decisions
- **Sample index as the clock, one fs per channel.** Every sample has an integer index on its channel's clock,
  and `t = index / fs` of that channel. ECG and SCG may have different rates (e.g. 512 Hz vs 3 kHz).
  Index 0 of every channel is the same instant, so the channels are aligned in **seconds**.
  See `docs/decisions/0003-per-channel-sample-rate.md`.
- **Single `DataSource` interface.** Replay, synthetic and BLE sources are interchangeable.
  The app is developed on replay/synthetic data and switched to BLE in M6 without rewriting the UI or DSP.
- **Raw is sacred.** Raw samples are recorded and exported. Filtering only affects the display and HR.
- **React for controls, not for samples.** Samples flow through ring buffers and a rAF loop that updates uPlot directly.
- **Web Bluetooth** (Chrome desktop/Android, HTTPS). See `docs/decisions/0001-web-bluetooth-react.md`.
- **Sessions and status.** Every source reports `onStatus({ state, error?, linkQuality? })`.
  Sample indices restart at 0 on each `start()`; switching source resets buffers, DSP and recording.
  "Pause" freezes the display only, acquisition continues. See `docs/decisions/0002-source-status-and-sessions.md`
  and the lifecycle in `src/core/CLAUDE.md`.

## Sources
| Source | Milestone | Channels | Notes |
|---|---|---|---|
| `ReplaySource` | M1–M2 | ecg or scg (one file each) | real speed, loops, files from `public/samples/` |
| `SyntheticSource` | M3 | ecg + scg simultaneous | known HR and R→AO delay, seeded, packetized mode in M6 |
| `BleSource` | M6 | ecg + scg | Web Bluetooth + `src/ble/decoder.ts` |

## Modules
| Folder | Responsibility | Local rules |
|---|---|---|
| `src/core` | types, `RingBuffer` | `src/core/CLAUDE.md` |
| `src/sources` | data sources | `src/sources/CLAUDE.md` |
| `src/io` | LVM/CSV/XLSX parsers, CSV/LVM writers | `docs/data-formats.md` |
| `src/dsp` | filters, HR, worker | `src/dsp/CLAUDE.md` |
| `src/ble` | Web Bluetooth, decoder | `src/ble/CLAUDE.md` |
| `src/recording` | IndexedDB recorder, markers, export | – |
| `src/plot` | uPlot wrapper, decimation | `src/plot/CLAUDE.md` |
| `src/ui`, `src/state` | React components, zustand store | – |
