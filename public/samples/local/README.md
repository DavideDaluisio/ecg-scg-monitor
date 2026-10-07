# Local recordings (not in git, not deployed)

Put real lab recordings here for local development (use the skill `import-recording`).
This folder is git-ignored and removed from `dist/` after every build: real ECG/SCG data is personal health data.

Expected files (neutral names, no personal names):
- `ecg_subject01.lvm` – ECG, 3000 Hz, 24 s
- `scg_subject01.csv` – SCG, 3000 Hz, ~9.3 s (converted from the lab `.xlsx` with `scripts/convert-xlsx.mjs`)

`manifest.json` in this folder lists them (same format as `public/samples/manifest.json`).
