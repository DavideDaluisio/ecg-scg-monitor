# Architecture

## Data flow

```
DataSource (Replay | Synthetic | BLE) ── onStatus ──▶ UI status badge
        │  SampleBlock { channel, seq, firstSampleIndex, fs, samples }   (one channel per block, volts)
        ▼
Ring buffers (one per channel, 30 s, own fs, sample index = clock)
        │                                   │
        ▼                                   ▼
Plot render loop (rAF, 60 fps)        Recorder (IndexedDB: raw 1-s chunks + markers) ──▶ CSV export ──▶ Python check
uPlot, min/max decimation, mV,        (only between Record and Stop recording)
marker lines
        ▲
UI (React + zustand): source picker, start/stop, pause display, window length, record, markers, saved sessions
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

| Source            | Milestone | Channels             | Notes                                                                                                                                                                                                                                                                                                             |
| ----------------- | --------- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ReplaySource`    | M1–M3     | one file per channel | one track per channel, all started at the same instant; each track loops on its own length. Real speed, `.lvm` / `.csv` / `.xlsx` files from `public/samples/` or opened from disk. Pacing by `Pacer` (max 1 s per tick: after a background tab it continues from where it was, no burst, index stays continuous) |
| `SyntheticSource` | M3        | ecg + scg            | PQRST + SCG AO/AC bursts, configurable HR, R→AO delay (the AO **peak** is exactly at R + delay) and fs per channel; optional noise, seeded (same settings = same samples). Same `Pacer` as the replay. Used to verify alignment                                                                                   |
| `BleSource`       | M5        | ecg + scg            | Web Bluetooth + `src/ble/decoder.ts`                                                                                                                                                                                                                                                                              |

## Modules

| Folder          | Responsibility                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Local rules                         |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------- |
| `src/core`      | types, `RingBuffer`, time helpers                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | `src/core/CLAUDE.md`                |
| `src/io`        | LVM/CSV/XLSX parsers (`parseRecording.ts` picks one from the extension; SheetJS lazy-loaded), manifests, CSV export (`csvExport.ts`, pure) and `download.ts` (Blob download)                                                                                                                                                                                                                                                                                                                                                                                                                           | `docs/data-formats.md`              |
| `src/sources`   | data sources                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | `src/sources/CLAUDE.md`             |
| `src/plot`      | uPlot wrapper, decimation, render loop                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | `src/plot/CLAUDE.md`                |
| `src/recording` | `Recorder` (one `ChannelChunker` per channel → IndexedDB), `db.ts` (`idb` schema and CRUD), marker helpers, saved-session names                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | `src/recording/CLAUDE.md`           |
| `src/ble`       | Web Bluetooth, decoder (M5)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | `src/ble/CLAUDE.md` (created in M5) |
| `src/state`     | `store.ts`: zustand UI state (source kind, recording choice and disk file per channel, synthetic settings, status, `sessionChannels`, `notSimultaneous`, pause, window, `recordingName`, `lastMarker`, `savedSessions`, `storageError`) and `getReplayInputs()`. `session.ts`: the running source + one ring buffer per channel, `startReplay()` / `startSynthetic()` / `stopSession()`, `getSessionEndSeconds()`, and the recording: `startRecording()` / `stopRecording()` / `addMarker()` / `getPlotMarkers()` (plain module, no React). `savedSessions.ts`: list, export, delete of saved sessions | –                                   |
| `src/ui`        | React components; `SourcePicker` (Recordings: one `RecordingPicker` per channel; Synthetic: `SyntheticSettingsForm`); `ChannelPanel` (one generic panel per channel) mounts `LivePlotView` when the session has that channel; `LivePlotView` mounts a `LivePlot` once and registers it in the render loop; `RecordControls` (Record, REC timer, marker label + Add marker); `SavedSessionList` (table with Export CSV / Delete)                                                                                                                                                                        | –                                   |

## Live view (M1–M3)

```
ReplaySource | SyntheticSource ──SampleBlock──▶ session.ts: RingBuffer.push() (one buffer per channel)
                                                     │
renderLoop.ts (one rAF) ──▶ for each panel: start = visibleWindowStart(getSessionEndSeconds(), W)
                            LivePlot.draw() → computePlotPoints: copyRange(window) → decimateMinMax (2 points/pixel, V → mV)
                                           → updateYRange (autoscale) → uPlot setData/setScale
```

- **Shared X axis:** `tEnd` = newest instant reached by any channel (`endIndex / fs`, max over channels). Every
  panel shows `[max(0, tEnd − W), +W]` in seconds; each channel converts the start to its own sample index, so
  channels with different fs line up. The trace fills 0…W s, then scrolls. W = 5 or 10 s. The Y axis has a fixed
  width, so the plot areas of the panels start at the same pixel.
- Pause skips `draw()` only; the source and the ring buffer keep running. All panels read the same `paused` flag in
  the same frame, so they freeze together, on the same window. Resume shows the live window again.
- **Cursor:** uPlot cursors share a sync key, so one vertical line crosses all panels at the same time. Each panel
  shows the time and value of its drawn point nearest to the cursor (`t = 2.3800 s · 1.200 mV`). Min/max decimation
  keeps the exact sample of each peak, but the mouse moves by pixels (≈ 9 ms at 10 s): it is a visual check. The
  ±1-sample check of the R→AO delay is `tests/unit/alignment.test.ts`, on the same points the plot draws.
- `draw()` returns early when no new sample arrived (the replay emits every ~20 ms, the screen refreshes every ~16 ms).
- One panel per channel (`ChannelPanel`). `sessionChannels` in the store lists the channels of the current or last
  session: those panels show the plot, the others a placeholder ("No SCG signal in this recording"), so an old trace
  never stays frozen next to the signal that is playing. It is kept after Stop, so the last frame stays on screen.
- Sources (M3): **Recordings** = one picker per channel (None, a manifest recording, or a file from disk); the
  chosen files play together as one multi-track `ReplaySource`. When two files are not marked `simultaneousWith`
  each other in a manifest (files from disk never are), a "Not simultaneous" note is shown above the panels.
  **Synthetic** = `SyntheticSource` with the settings form (HR, R→AO, fs per channel, noise).

## Recording, markers, export (M4)

```
Record ──▶ session.ts: new Recorder (synchronous; DB opened as a promise, so no block is lost)
               │  every block: RingBuffer.push() + Recorder.push()
               ▼
           ChannelChunker per channel (1-s Float32Array chunks, NaN for gaps, from the channel's endIndex at Record)
               │  full chunk
               ▼
           promise chain ──▶ IndexedDB: chunk + session meta in one transaction (≈ 1 per second per channel)
Add marker ──▶ { reference channel, newest sample index, label } ──▶ meta.markers + plot marker line
Stop recording / Stop / ended / error ──▶ flush partial chunks, status 'complete', refresh the saved-session list
Export CSV ──▶ loadChannelSamples() per channel ──▶ buildCsvExport() (one file, or one per channel if fs differ)
           ──▶ Blob download ──▶ python scripts/check_export.py
```

- **Record button**, enabled while the source runs. Recording keeps going while the display is paused (principle 7).
  Each channel records from its own next sample; the **live session index is kept** (never re-based), so the export
  says exactly when each sample happened since Start, on every channel.
- **Markers only while recording**, so every marker on screen is saved. The marker sits on the newest sample of the
  reference channel (highest fs, ECG if equal). The app shows its time and sample index; the export has it on the
  same index. Marker lines are drawn by a uPlot `draw` hook on every panel at the same `t` (shared X axis).
- **Saved sessions** are listed under the panels (name = date and time, duration, channels, markers, size), with
  **Export CSV** and **Delete**. A session interrupted by closing the tab is still exportable.
- Formats: `docs/data-formats.md` (CSV export v1, markers, IndexedDB layout). Local rules: `src/recording/CLAUDE.md`.
- Verification: `tests/unit/recordingPipeline.test.ts` (synthetic source → recorder → IndexedDB → CSV: every
  sample equals the model at its index, markers at the right index, same and different fs) and
  `scripts/check_export.py` on a 5-min export from the app.
