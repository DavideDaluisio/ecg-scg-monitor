---
name: import-recording
description: Import a new lab recording (.lvm, .xlsx, .csv) into the ECG/SCG monitor for local replay, keeping personal health data out of git. Use when the user provides a new ECG or SCG file or asks to add a recording.
---

# Import a lab recording

Real recordings are personal health data. They go **only** in `public/samples/local/` (git-ignored).

1. Inspect the file (read-only): format, header, number of samples, Δt → fs, units, value range,
   number of channels/segments. Compare with `docs/data-formats.md` and note any new quirk there.
2. Choose a **neutral id**: `<channel>_subjectNN` (e.g. `ecg_subject02`). Never use the person's name,
   the operator or the date from the file.
3. Copy or convert into `public/samples/local/`:
   - `.lvm` → copy as `<id>.lvm`.
   - `.xlsx` → `node scripts/convert-xlsx.mjs <input.xlsx> public/samples/local/<id>.csv <channel>`.
   - `.csv` → make sure the header is `time_s,<channel>_V`.
4. Add an entry to `public/samples/local/manifest.json`:
   `{ "id", "file", "channel", "fs", "samples", "durationS", "simultaneousWith": null }`.
5. Add a row to the "Local recordings" table in `docs/data-formats.md` (no personal data).
6. Check with `git status` that **nothing** under `public/samples/local/` is staged except `README.md`.
7. If the recording is ECG + SCG recorded **at the same time**, say so to the user: it answers open question #5
   in `docs/questions-for-team.md`.
