# ECG/SCG Monitor

Web app that shows ECG and SCG signals from the NJIT wireless cardiac patch in real time, in the browser.
Model: Figure 1F of Bhattacharya et al., _Adv. Electron. Mater._ 2023 (one SCG channel instead of three).

- Runs in **Chrome** on a laptop or an Android phone. No installation: open the link.
- Until the patch and its Bluetooth module (BL653µ) are ready, the app replays lab recordings and synthetic signals.
- iPhone is not supported (Safari has no Web Bluetooth).

**Live demo:** https://davidedaluisio.github.io/ecg-scg-monitor/

## Run locally

Requires Node.js 24.

```
npm install
npm run dev        # http://localhost:5173/ecg-scg-monitor/
npm test           # unit tests
npm run e2e        # end-to-end smoke test (first time: npx playwright install chromium)
```

## Data

Real recordings are personal health data: they are kept in `public/samples/local/` (not in git, not deployed).
See `docs/data-formats.md`.

## Project docs

- `docs/roadmap.md` – milestones and progress
- `docs/architecture.md` – how the app is built
- `docs/data-formats.md` – LVM / CSV / XLSX formats and export
- `docs/ble-protocol.md` – Bluetooth packet format (draft, to be agreed with the firmware)
- `docs/questions-for-team.md` – open hardware/firmware questions
- `docs/updates/` – weekly updates

The app is developed with Claude Code: see `CLAUDE.md` and `.claude/`.
