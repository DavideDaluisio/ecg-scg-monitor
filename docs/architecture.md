# Architecture

## Data flow

```
DataSource (Replay | Synthetic | BLE) ── onStatus ──▶ UI status badge
        │  SampleBlock { channel, seq, firstSampleIndex, fs, samples }   (one channel per block, volts)
        ▼
Ring buffers (one per channel, 30 s, own fs, sample index = clock)
        │                                   │
        ▼                                   ▼
Plot render loop (rAF, 60 fps)        Recorder (IndexedDB, raw + markers, M4) ──▶ CSV export
uPlot, min/max decimation, mV
        ▲
UI (React + zustand): source picker, start/stop, pause display, window length, markers, sessions
```

## Key decisions

- **Sample index as the clock, one fs per channel.** `t = index / fs` of that channel. Index 0 of every channel is
  the same instant, so channels are aligned in seconds. ECG and SCG may end up with different rates on the real patch.
- **Single `DataSource` interface.** Replay and synthetic sources are used in M1–M4. `BleSource` replaces them in M5
  without changes to the plot, the recorder or the UI.
- **Raw is sacred.** Raw samples are recorded and exported. No DSP filtering in the current scope.
- **React for controls, not for samples.** Samples flow through ring buffers and a rAF loop that updates uPlot directly.
- **Web Bluetooth** (Chrome desktop/Android over HTTPS or localhost). iPhone is not supported. If iOS is needed later,
  the app can be wrapped with Capacitor and a native BLE plugin behind the same `DataSource` interface.

## Sources

| Source            | Milestone | Channels             | Notes                                                                                                                                                                                                     |
| ----------------- | --------- | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ReplaySource`    | M1–M2     | one file per channel | real speed, loops, `.lvm` / `.csv` / `.xlsx` files from `public/samples/` or opened from disk. Max 1 s per tick: after a background tab it continues from where it was (no burst, index stays continuous) |
| `SyntheticSource` | M3        | ecg + scg            | known HR and R→AO delay, seeded, used to verify alignment                                                                                                                                                 |
| `BleSource`       | M5        | ecg + scg            | Web Bluetooth + `src/ble/decoder.ts`                                                                                                                                                                      |

## Modules

| Folder          | Responsibility                                                                                                                                                                                        | Local rules                         |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| `src/core`      | types, `RingBuffer`, time helpers                                                                                                                                                                     | `src/core/CLAUDE.md`                |
| `src/io`        | LVM/CSV/XLSX parsers (`parseRecording.ts` picks one from the extension; SheetJS lazy-loaded), manifests, CSV export (M4)                                                                              | `docs/data-formats.md`              |
| `src/sources`   | data sources                                                                                                                                                                                          | `src/sources/CLAUDE.md`             |
| `src/plot`      | uPlot wrapper, decimation, render loop                                                                                                                                                                | `src/plot/CLAUDE.md`                |
| `src/recording` | IndexedDB recorder, markers                                                                                                                                                                           | –                                   |
| `src/ble`       | Web Bluetooth, decoder (M5)                                                                                                                                                                           | `src/ble/CLAUDE.md` (created in M5) |
| `src/state`     | `store.ts`: zustand UI state (status, picker, disk file + its channel, `sessionChannels`, pause, window). `session.ts`: the running source + one ring buffer per channel (plain module, no React)     | –                                   |
| `src/ui`        | React components; `ChannelPanel` (one generic panel per channel) mounts `LivePlotView` when the session has that channel; `LivePlotView` mounts a `LivePlot` once and registers it in the render loop | –                                   |

## Live view (M1–M2)

```
ReplaySource ──SampleBlock──▶ session.ts: RingBuffer.push()
                                   │
renderLoop.ts (one rAF) ──▶ LivePlot.draw(): copyRange(last W s) → decimateMinMax (2 points/pixel, V → mV)
                                             → updateYRange (autoscale) → uPlot setData/setScale
```

- X window = `[max(0, tEnd − W), +W]`: the trace fills 0…W s, then scrolls. W = 5 or 10 s.
- Pause skips `draw()` only; the source and the ring buffer keep running. Resume shows the live window again.
- `draw()` returns early when no new sample arrived (the replay emits every ~20 ms, the screen refreshes every ~16 ms).
- One panel per channel (`ChannelPanel`). `sessionChannels` in the store lists the channels of the current or last
  session: those panels show the plot, the others a placeholder ("No SCG signal in this recording"), so an old trace
  never stays frozen next to the signal that is playing. It is kept after Stop, so the last frame stays on screen.
- M2 plays one recording at a time (ECG or SCG). Both together arrive in M3.
