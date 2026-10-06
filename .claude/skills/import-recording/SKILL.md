---
name: import-recording
description: Add a new lab recording (LabVIEW .lvm, .xlsx or .csv with ECG/SCG data) to the app's replay samples. Use when the user receives new data files from the lab or wants to replay a specific recording.
---

# Import a new lab recording

Original files arrive in `../Resources/` (outside the repo). Do not edit originals.

1. Inspect the file first: header, columns, units, sample count, Δt (compute fs = 1/Δt), duration, DC offset, range.
   Report these numbers to the user before converting.
2. Convert into `public/samples/`:
   - `.lvm` → copy as is if it is single-segment and tab-separated. Otherwise normalize to CSV.
   - `.xlsx` → CSV with header `time_s,<channel>_V` (e.g. `scg_V`). Use `npx tsx scripts/convert-samples.ts <in> <out>`.
   - File names: `<channel>_<subject-or-tag>[_<n>].<ext>`, lowercase, no spaces.
3. Add an entry to `public/samples/manifest.json`:
   `{ "id", "file", "channels", "fs", "samples", "durationS", "units": "V", "simultaneous": bool, "source", "notes" }`.
   `simultaneous: true` only if ECG and SCG were recorded at the same time on the same clock.
4. Add a row to the samples table in `docs/data-formats.md`.
5. Add or update a parser test that checks sample count and fs for the new file.
6. Run `npm test`, then `run-app` with the new sample selected.
