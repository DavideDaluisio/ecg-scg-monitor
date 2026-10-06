# Data formats

## Data privacy (read this first)
Real ECG/SCG recordings are **personal health data**. The GitHub repo and the GitHub Pages site are public
(a Pages site is public even when the repo is private), so:
- Real recordings are **never committed and never deployed**. They live only in `public/samples/local/`,
  which is git-ignored. `vite.config.ts` deletes `dist/samples/local/` after every build.
- Use neutral ids and file names (`ecg_subject01`), never a person's name. Do not copy names, dates or
  operators from the original files into the manifest or the docs.
- Tests use **synthetic** fixtures (`tests/fixtures/`, made by `scripts/make-fixtures.mjs`).
- `public/samples/manifest.json` (deployed) lists only data that is safe to publish. It is empty for now.
  Publishing a real, anonymized recording needs the team's approval first (see `docs/questions-for-team.md`).

## Local recordings (`public/samples/local/`, not in git)
| id | File | Channel | fs | Samples | Duration | Units / range | Simultaneous with |
|---|---|---|---|---|---|---|---|
| `ecg_subject01` | `ecg_subject01.lvm` | ECG | 3000 Hz (Δt = 0.000333 s) | 72,000 | 24.0 s | V, DC offset ≈ 1.6 V | – |
| `scg_subject01` | `scg_subject01.csv` | SCG | 3000 Hz (Δt ≈ 0.000333 s) | 28,000 | 9.33 s | V, ≈ ±0.02 V, zero-centered | – |

The two recordings were **not** made at the same time. They cannot be used to measure ECG→SCG timing.
The metadata is also in `public/samples/local/manifest.json` (same fields as the public manifest, `file`
relative to `public/samples/`). The originals are in the lab's private `Resources/` folder, outside this repo.
On the deployed site, users open their own recordings from disk; the file is read in the browser and never uploaded.

## Test fixtures (`tests/fixtures/`, committed)
| File | Channel | fs | Samples | Content |
|---|---|---|---|---|
| `ecg_synthetic.lvm` | ECG | 3000 Hz | 6,000 (2 s) | fake PQRST at 72 bpm, 1.6 V offset, same LVM header layout (incl. the `Samples 1000` quirk) |
| `scg_synthetic.csv` | SCG | 3000 Hz | 6,000 (2 s) | fake 30 Hz damped bursts, 50 ms after each R peak, ≈ ±0.02 V |

Regenerate with `node scripts/make-fixtures.mjs` (deterministic).

## LabVIEW `.lvm` (input)
- Text file, tab-separated, `.` as the decimal separator.
- A file header ends with `***End_of_Header***`, then a segment header (Channels, Samples, Date, Time,
  `Y_Unit_Label`, `X0`, `Delta_X`) ends with another `***End_of_Header***`, followed by the column line
  `X_Value	Voltage_0	Comment` and the data rows `time<TAB>value`.
- **Known quirk:** in the lab ECG recording (and in `tests/fixtures/ecg_synthetic.lvm`) the segment header says `Samples 1000`, but the file contains many more rows.
  The parser must count the rows and **not trust** `Samples`.
- fs = 1 / `Delta_X`. `0.000333` is a rounded 1/3000, so round fs to the nearest integer Hz.
- Some LVM files contain multiple segments (several header blocks) or multiple channels. The parser must
  handle both, or fail with a clear message.

## CSV (input and export)
Input sample files: header `time_s,<channel>_V`, one row per sample, `.` as the decimal separator.

Export format (M5), when **all channels have the same fs**:
```
# ecg-scg-monitor export v1
# start_iso=2026-10-06T15:00:00.000Z fs=3000 source=synthetic
sample_index,time_s,ecg_V,scg_V,marker
0,0.000000,1.605213,0.022260,
1,0.000333,1.601534,0.021660,stand up
```
- `time_s = sample_index / fs` (not wall-clock time).
- Missing samples are written as empty cells (NaN in memory).
- `marker` is non-empty only on the sample where the marker was placed.

When the channels have **different fs** (e.g. ECG 512 Hz, SCG 3000 Hz), the export writes **one CSV per channel**
(`<session>_ecg.csv`, `<session>_scg.csv`), each with its own `fs` in the header and the columns
`sample_index,time_s,<channel>_V,marker`. Rows are never resampled or interpolated: raw stays raw.
`time_s = sample_index / fs` of that file, so the files line up in seconds. LVM export follows the same rule
(one channel per file when fs differs).

## Markers
- Stored as `{ channel, sampleIndex, label }` on the session's **reference channel**: the channel with the highest fs
  (ECG when the rates are equal). `t = sampleIndex / fs(channel)`, never wall-clock time.
- On export, a marker is placed in every other channel at `round(t × fs_other)`.

## XLSX (input)
Read with SheetJS (lazy-loaded). First sheet, first two columns = time (s), value (V), first row = header.

## In-memory: `SampleBlock`
See `src/core/CLAUDE.md`. One channel per block, values in volts, `Float32Array`, with that channel's `fs` and
`firstSampleIndex`. Channels may have different fs (`docs/decisions/0003-per-channel-sample-rate.md`).

## BLE packets
See `docs/ble-protocol.md`.
