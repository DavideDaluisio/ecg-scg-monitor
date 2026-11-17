# Architecture

## Data flow

```
DataSource (Replay | Synthetic | BLE) ── onStatus ──▶ UI status dot
        │  SampleBlock { channel, seq, firstSampleIndex, fs, samples }   (one channel per block, volts)
        ▼
Ring buffers (one per channel, 30 s, own fs, sample index = clock)
        │                                   │
        ▼                                   ▼
Plot render loop (rAF, 60 fps)        Recorder (IndexedDB: raw 1-s chunks + markers) ──▶ Excel / CSV export
uPlot, min/max decimation, mV,        (only between Record and Stop recording)
marker lines, PQRST symbols (ECG) ◀── PqrstTracker (ECG blocks: QRS detector + wave search, display only)
AO symbols (SCG)                  ◀── AoTracker (R peaks of the PqrstTracker + SCG ring buffer, display only)
        ▲
UI (React + zustand): source picker, start/stop, pause display, window length, record, markers, saved sessions
```

## Key decisions

- **Sample index as the clock, one fs per channel.** `t = index / fs` of that channel. Index 0 of every channel is
  the same instant, so channels are aligned in seconds. ECG and SCG may end up with different rates on the real patch.
- **Single `DataSource` interface.** Replay and synthetic sources are used in M1–M4. `BleSource` replaces them in M5
  without changes to the plot, the recorder or the UI.
- **Raw is sacred.** Raw samples are recorded and exported. The signal is never filtered: the only filters are
  inside the PQRST detector (`src/analysis/`), which only decides where to draw the P, Q, R, S, T symbols. The AO
  symbols of the SCG are placed on the raw SCG (no filter).
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

| Folder          | Responsibility                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Local rules                         |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| `src/core`      | types, `RingBuffer`, time helpers                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | `src/core/CLAUDE.md`                |
| `src/io`        | LVM/CSV/XLSX parsers (`parseRecording.ts` picks one from the extension; SheetJS lazy-loaded), manifests, exports of a saved session (pure: `xlsxExport.ts` + `xlsxXml.ts` for Excel, `csvExport.ts` for CSV, `exportShared.ts` common rules; `zip.ts` zips the .xlsx with `fflate`, lazy-loaded) and `download.ts` (Blob download)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | `docs/data-formats.md`              |
| `src/sources`   | data sources                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | `src/sources/CLAUDE.md`             |
| `src/plot`      | uPlot wrapper, decimation, render loop                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | `src/plot/CLAUDE.md`                |
| `src/analysis`  | ECG P, Q, R, S, T and SCG AO detection for display only: `biquad.ts` (2nd-order IIR, used inside the detector only), `qrsDetector.ts` (streaming simplified Pan–Tompkins), `pqrstPoints.ts` (`findPqrst`: wave windows around R, prominence rule; `WavePoint`), `pqrstTracker.ts` (one per session, fed with the ECG blocks by `session.ts`, `onBeat` callback), `aoPoint.ts` (`findAo`: window after R, prominence rule), `aoTracker.ts` (one per session with simultaneous ECG + SCG, fed with the R peaks)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | `src/analysis/CLAUDE.md`            |
| `src/recording` | `Recorder` (one `ChannelChunker` per channel → IndexedDB), `db.ts` (`idb` schema and CRUD), marker helpers, saved-session names                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | `src/recording/CLAUDE.md`           |
| `src/ble`       | Web Bluetooth, decoder (M5)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | `src/ble/CLAUDE.md` (created in M5) |
| `src/state`     | `store.ts`: zustand UI state (source kind, recording choice and disk file per channel, synthetic settings, status, `sessionChannels`, `notSimultaneous`, pause, window, `showPqrst`, `showAo`, `recordingName`, `recordingMarkers`, `customMarkerTypes`, `savedSessions`, `storageError`) and `getReplayInputs()`. `session.ts`: the running source + one ring buffer per channel, `startReplay()` / `startSynthetic()` / `stopSession()`, `getSessionEndSeconds()`, and the recording: `startRecording()` / `stopRecording()` / `addMarker()` / `renameLiveMarker()` / `getPlotMarkers()`, and `getEcgBeats()` (P, Q, R, S, T of the ECG, from a `PqrstTracker` fed in `onBlock`) and `getScgAoPoints()` (AO of the SCG, from an `AoTracker` fed with its R peaks, only with a simultaneous ECG) (plain module, no React). `savedSessions.ts`: list, export (Excel or CSV), rename a marker, delete. `customMarkerTypes.ts`: the user's marker types in `localStorage`                                                                                                                                        | –                                   |
| `src/ui`        | React components; `TopBar` (the only row of controls: title, source button, `Controls`, `RecordControls`, "Not simultaneous" chip, `StatusBadge` dot; opens `SourcePicker` under it, shows `MarkerBar` while recording); `Controls` (Start ↔ Stop, Pause/Resume while running, window 5 s / 10 s); `RecordControls` (Rec ↔ Stop rec + REC timer); `MarkerBar` (one button per marker type, "+" for another name, live marker list behind "Markers (n)"); `SourcePicker` (panel: Recordings = one `RecordingPicker` per channel; Synthetic = `SyntheticSettingsForm` under "Advanced"; the source info line); icons are inline SVG (`icons.tsx`); `ChannelPanel` (one generic panel per channel) mounts `LivePlotView` when the session has that channel, and the ECG panel's header has the "Show PQRST" checkbox, the SCG panel's the "Show AO" checkbox (disabled without a simultaneous ECG); `LivePlotView` mounts a `LivePlot` once and registers it in the render loop; `MarkerTable` (markers with Rename, live and saved); `SavedSessionList` (table with markers, Export Excel / Export CSV / Delete) | –                                   |

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
  chosen files play together as one multi-track `ReplaySource`. A multi-channel `.lvm` file is read one column per
  channel (spreadsheet letter: manifest `column`, or a "Column" select for a file from disk, with no guessed
  default). When the two recordings are not marked `simultaneousWith` each other in a manifest, and are not two
  columns of the same file from disk, a "Not simultaneous" note is shown above the panels.
  **Synthetic** = `SyntheticSource` with the settings form (HR, R→AO, fs per channel, noise).

## ECG PQRST markers (display only)

```
ECG SampleBlock ──▶ session.ts: RingBuffer.push() ──▶ PqrstTracker.push()
                                                        │ QrsDetector (sample by sample): band-pass 5–15 Hz → slope²
                                                        │   → 150-ms moving window → adaptive threshold → QRS peak
                                                        ▼
                    once the buffer holds peak + 0.45 s: copyRange (≈ 1.1 s) → findPqrst → beats[] (≤ 300)
LivePlot draw hook (ECG panel) ──▶ dot on each wave's sample + its letter (P, R, T above; Q, S below)
```

- **Display only.** Nothing is recorded or exported; the raw signal is untouched. The band-pass filter exists only
  inside the detector. The **Show PQRST** checkbox in the ECG panel header (shown when the session has an ECG,
  checked by default) hides or shows the
  symbols at once, also on a paused plot.
- **QRS detector** (`qrsDetector.ts`, simplified Pan & Tompkins 1985): 5–15 Hz band-pass (two biquads primed on the
  first sample, so the ≈ 1.6 V offset of the lab's raw ECG gives no start-up transient), slope, square, 150-ms
  moving-window integration. A QRS is a bump above 0.3 × the running level of the QRS peaks (2-s learning phase,
  200-ms refractory period). Robustness: a peak raises the level by at most 4× its value (artifacts), the level is
  halved after 3 s without a QRS (at most 5 times in a row), and a bump within 360 ms of a QRS and less than half as
  strong is taken as its T wave. A gap in the indices or a NaN restarts the detector (new learning phase).
- **Waves** (`findPqrst`, on the raw samples): R = highest sample in the 225 ms before the detector's peak
  (`PLACEHOLDER(Q10)`: R assumed positive); Q / S = lowest sample in the 60 ms before / after R;
  P = highest in [R − min(0.30 s, 0.45 × RR), R − 0.08 s]; T = highest in [R + 0.10 s, R + min(0.45 s, 0.55 × RR)];
  RR = distance from the previous QRS (0.8 s for the first beat). A wave whose extreme does not stand out from both
  ends of its window by more than 3 % of the R height is left out (no symbol rather than a wrong one).
- **Latency:** the first 2 s are not marked (learning); then each beat's symbols appear ≈ 0.6 s after its R peak,
  just left of the right edge. A paused plot draws only the beats it already had, so the frozen frame never changes.
- **Limits:** during movement artifacts the detector marks extra beats; P/Q/S/T on real recordings are best-effort
  (no clinical use). Checked on the local lab recordings: on `ecg_subject01` (≈ 75 bpm) one beat per R outside the
  artifact at 4.5–5.3 s.
- Verification: `tests/unit/qrsDetector.test.ts` (one detection per beat at 60–150 bpm and 250–3000 Hz, DC offset,
  wander, noise, artifact recovery, gaps), `pqrstPoints.test.ts` (synthetic waves: R ±1 sample, P/Q/S/T ±5 ms),
  `pqrstTracker.test.ts` (whole path through the ring buffer) and the e2e PQRST test (hide/show while paused).

## SCG AO markers (display only)

```
PqrstTracker beat (≈ 0.6 s after R) ──onBeat──▶ AoTracker.addRPeak(R)   (ECG index → seconds → SCG index)
any SampleBlock ──▶ session.ts: RingBuffer.push() ──▶ AoTracker.update()
                     once the SCG buffer holds R + 0.25 s: copyRange (1 s) → findAo → points[] (≤ 300)
LivePlot draw hook (SCG panel) ──▶ dot on the AO sample + "AO" above it
```

- **Method** (as in the reference paper, which segments the SCG beat by beat with the ECG R peaks): the AO is the
  highest raw SCG sample in [R + 0.04 s, R + min(0.25 s, 0.45 × RR)], RR = distance from the previous R (0.8 s for the
  first beat). The window ends before the aortic closing (AC), also at high heart rates. `PLACEHOLDER(Q11)`: AO
  assumed positive (upward).
- **Only with a simultaneous ECG.** The tracker exists only when the session has an ECG and an SCG recorded at the
  same time (synthetic, two columns of the same file, demos marked `simultaneousWith`, later BLE). With an SCG alone
  or two unrelated files there is no AO, and the **Show AO** checkbox in the SCG panel header is disabled with a
  tooltip that says why. Otherwise it is checked by default and hides or shows the symbols at once, also when paused.
- **When unsure, no symbol:** the AO is left out when its window has a NaN, or when it does not stand out from both
  ends of the window by more than 10 % of the SCG's peak-to-peak range over the second that ends with the window.
  This rejects a window that holds only a slope (the real AO is outside it) and the beats next to a movement
  artifact (much larger than a beat).
- **Latency:** the AO of a beat appears with its PQRST symbols (≈ 0.6 s after R, first 2 s not marked).
- **Limits:** checked on `ecg_scg_subject02` (≈ 100 bpm, 60 Hz hum on the SCG): AO on ≈ 90 % of the beats,
  R→AO median 125 ms; the hum moves the marked sample by a few ms around the smooth peak. Next to large artifacts an
  artifact spike can still be marked, and with a noise-only SCG (patch off the chest) noise peaks are marked. No
  R→AO (PEP) value is computed or shown.
- Verification: `tests/unit/aoPoint.test.ts` (synthetic SCG: AO ±1 sample for 60–150 bpm, R→AO 60–200 ms,
  250–3000 Hz; ±3 ms with noise; null for an AO after the window, next to an artifact, NaN, flat line),
  `aoTracker.test.ts` (whole path ECG + SCG → ring buffers → PqrstTracker → AoTracker, ECG and SCG at different fs,
  SCG blocks arriving late) and the e2e AO test (hide/show while paused, disabled with the SCG demo alone).

## Recording, markers, export (M4)

```
Record ──▶ session.ts: new Recorder (synchronous; DB opened as a promise, so no block is lost)
               │  every block: RingBuffer.push() + Recorder.push()
               ▼
           ChannelChunker per channel (1-s Float32Array chunks, NaN for gaps, from the channel's endIndex at Record)
               │  full chunk
               ▼
           promise chain ──▶ IndexedDB: chunk + session meta in one transaction (≈ 1 per second per channel)
Marker button ──▶ { reference channel, newest sample index, label } ──▶ meta.markers + plot marker line + live list
Rename (recording) ──▶ Recorder.renameMarker() (same promise chain) + plot label + live list
Stop recording / Stop / ended / error ──▶ flush partial chunks, status 'complete', refresh the saved-session list
Rename (saved session) ──▶ renameSavedMarker() (one IndexedDB transaction) ──▶ refresh the list
Export Excel ──▶ loadChannelSamples() per channel ──▶ buildXlsxExport() (Info, Markers, data sheets as XML parts)
           ──▶ zipToBlob() (fflate, one part at a time, pause between parts) ──▶ Blob download (.xlsx)
Export CSV ──▶ loadChannelSamples() per channel ──▶ buildCsvExport()
           (one file, or one per channel if fs differ) ──▶ Blob download ──▶ python scripts/check_export.py
```

- **Record button**, enabled while the source runs. Recording keeps going while the display is paused (principle 7).
  Each channel records from its own next sample; the **live session index is kept** (never re-based), so the export
  says exactly when each sample happened since Start, on every channel. The export's `time_s` column starts at 0 at
  Record (same zero for every channel and file); `sample_index` is the one the app shows for a marker.
- **Markers only while recording**, so every marker on screen is saved. One button per type (presets + the types
  the user created, remembered in `localStorage`) and a free-name field. The marker sits on the newest sample of the
  reference channel (highest fs, ECG if equal). The live list shows its time since Record (= the export's time) and,
  in a tooltip, its sample index; the export has it on the same index. Marker lines are drawn by a uPlot `draw` hook
  on every panel at the same `t` (shared X axis); the plot redraws when `getPlotMarkersVersion()` changes (add,
  rename, new session).
- **Saved sessions** are listed under the panels (name = date and time, duration, channels, markers, size). The
  markers count opens the session's markers (renamable). **Export Excel** (`.xlsx` for people), **Export CSV** (for
  code) and **Delete**. A session interrupted by closing the tab is still exportable.
- Formats: `docs/data-formats.md` (Excel and CSV export, markers, IndexedDB layout). Local rules:
  `src/recording/CLAUDE.md`.
- Verification: `tests/unit/recordingPipeline.test.ts` (synthetic source → recorder → IndexedDB → CSV: every
  sample equals the model at its index, markers at the right index, same and different fs),
  `tests/unit/xlsxExport.test.ts` (the .xlsx read back with SheetJS: every sample exactly, markers, split into
  sheets, different fs) and `scripts/check_export.py` on a 5-min CSV export from the app.
