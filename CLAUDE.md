# ECG/SCG Real-Time Monitor

Web app (PWA) that plots ECG and SCG signals from the NJIT wireless cardiac patch in real time.
The target is Figure 1F of the reference paper ("Wireless ECG and SCG patch", Adv. Electron. Mater. 2023),
with two differences: **one SCG channel** (not X/Y/Z), and a target of **3 kHz** sampling. ECG and SCG may end up
with different rates (the paper's MAX30003 ECG chip stops at 512 Hz), so the app supports **one fs per channel**.
The BLE module is the **BL653µ** (Ezurio, nRF52833-based). Its firmware is written outside this repo.
Until hardware is available, the app runs on **simulated data** (file replay + synthetic generator).

## Status
The current milestone is tracked in `docs/roadmap.md`. Work on **one milestone at a time**, in order:
M0 scaffold → M1 ECG live → M2 SCG live → M3 ECG+SCG together → M4 filters + HR → M5 recording/markers/export → M6 BLE.

## Stack
React + TypeScript + Vite, `uplot` (plots), `zustand` (UI state), `idb` (IndexedDB), `vite-plugin-pwa`,
`xlsx` (lazy-loaded, import only). Tests: `vitest` (unit), `@playwright/test` (e2e).
Runs in Chrome (desktop and Android) because it needs Web Bluetooth. iPhone is not supported.

## Commands
| Command | What it does |
|---|---|
| `npm run dev` | Dev server on http://localhost:5173 (Web Bluetooth works on localhost) |
| `npm test` | Vitest unit tests |
| `npm run e2e` | Playwright end-to-end tests |
| `npm run lint` / `npm run typecheck` | ESLint / `tsc -b` (checks `tsconfig.app.json` + `tsconfig.node.json` via project references) |
| `npm run build` | Production build into `dist/` (deployed to GitHub Pages by CI) |

## Folder map
- `src/core/` – `SampleBlock`, `DataSource`, `RingBuffer`. The contracts everything else depends on.
- `src/sources/` – `ReplaySource`, `SyntheticSource`, `BleSource`.
- `src/io/` – parsers (LVM, CSV, XLSX) and writers (CSV, LVM).
- `src/dsp/` – biquad filters, R-peak/HR detection, `dsp.worker.ts`.
- `src/ble/` – Web Bluetooth connection and packet decoder.
- `src/recording/` – IndexedDB recorder, markers, export.
- `src/plot/` – uPlot wrapper, min/max decimation, scrolling/sweep modes.
- `src/ui/`, `src/state/` – React components and zustand store.
- `public/samples/` – lab recordings used by the replay source (see `docs/data-formats.md`).
- `tests/` – `unit/`, `fixtures/` (small data extracts and scipy reference vectors), `e2e/`.
- `docs/` – architecture, data formats, BLE protocol, roadmap, open questions, ADRs, weekly updates.

Some folders have their own `CLAUDE.md` with local rules. Read it before editing that folder.

## Architecture principles (do not break these)
1. **Time is the sample index**, never `Date.now()`. **Each channel has its own fs and its own index**,
   and `t = sampleIndex / fs` of that channel. Index 0 of every channel is the same instant, which keeps ECG and SCG
   aligned in seconds (and later lets us measure the electro-mechanical delay). See ADR 0003.
2. **One `DataSource` interface** for every source. Switching from replay to BLE changes only the source.
3. **`SampleBlock`** = `{ channel, seq, firstSampleIndex, fs, samples: Float32Array }`, one channel per block.
4. **Ring buffers** (`Float32Array`, 30 s per channel) with no allocations in the hot path.
5. **DSP runs in a Web Worker** with causal IIR biquads for live view.
6. **Plot** with uPlot, min/max decimation per pixel, redrawn in a `requestAnimationFrame` loop (not via React state).
7. **Recording** stores raw samples + markers (`{ channel, sampleIndex, label }`) in IndexedDB. Export to CSV and LVM.

Details: `docs/architecture.md`.

## How to work with the user
- The user is a **beginner with TypeScript/React**. Keep code simple and explicit: no clever abstractions,
  no premature generalization, small files, descriptive names.
- After each change, explain in your reply **in Italian**, in 3–5 lines, what you did and why.
  Code, comments, commit messages and docs stay **in English** (the lab reads them).
- Prefer plan mode for anything larger than a small fix. Propose the plan, wait for approval.
- When a decision depends on hardware/firmware facts that are unknown, do not guess silently:
  add the question to `docs/questions-for-team.md` and use a clearly marked placeholder.

## Definition of Done (for every change)
- `npm run typecheck`, `npm run lint` and `npm test` pass.
- New logic has unit tests (parsers, DSP, decoder, buffers must always be tested).
- UI changes are checked in the running app (skill `run-app`).
- `docs/roadmap.md` is updated when a milestone task is completed.
- Interface or format changes are reflected in `docs/architecture.md`, `docs/data-formats.md` or `docs/ble-protocol.md`.

## Claude Code tooling in this repo
- Skills (`.claude/skills/`): `run-app`, `add-data-source`, `dsp-filter`, `ble-protocol`, `import-recording`, `weekly-update`.
- Agents (`.claude/agents/`): `dsp-reviewer`, `perf-auditor`, `test-writer`, `ble-integration-reviewer`.
- Hooks (`.claude/settings.json`): auto-format edited TS files, typecheck before finishing a turn.
