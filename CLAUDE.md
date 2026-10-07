# ECG/SCG Real-Time Monitor

Web app that plots ECG and SCG signals from the NJIT wireless cardiac patch in real time.
Target: Figure 1F of the reference paper (Bhattacharya et al., "A Chest-Conformable, Wireless Electro-Mechanical
E-Tattoo…", Adv. Electron. Mater. 2023), with two differences: **one SCG channel** (not X/Y/Z) and **3 kHz** sampling.
The BLE module will be the **BL653µ** (Ezurio, nRF52833-based). Its firmware is written outside this repo.
Until hardware is available, the app runs on **simulated data** (file replay + synthetic generator).

## Status

Current milestone and checklist: `docs/roadmap.md`. Work on **one milestone at a time**, in order:
M0 scaffold → M1 ECG live → M2 SCG live → M3 ECG + SCG together → M4 recording, markers, export → M5 BLE.
Out of scope for now: DSP filters, heart rate, PEP/LVET. Do not add them unless asked.

## Stack

React 19 + TypeScript (strict) + Vite, `uplot` (plots), `zustand` (UI state), `idb` (IndexedDB),
`xlsx` (SheetJS, lazy-loaded, import only). Tests: `vitest` (unit), `@playwright/test` (e2e). Lint: `oxlint`.
Runs in Chrome (desktop and Android) because M5 needs Web Bluetooth. iPhone is not supported.

## Commands

| Command                              | What it does                                                   |
| ------------------------------------ | -------------------------------------------------------------- |
| `npm run dev`                        | Dev server on http://localhost:5173/ecg-scg-monitor/           |
| `npm test`                           | Vitest unit tests (`tests/unit/`)                              |
| `npm run e2e`                        | Playwright smoke tests (builds and serves on port 4173)        |
| `npm run lint` / `npm run typecheck` | oxlint / `tsc -b`                                              |
| `npm run build`                      | Production build into `dist/` (deployed to GitHub Pages by CI) |
| `npm run fixtures`                   | Regenerates the synthetic test fixtures in `tests/fixtures/`   |

## Folder map

- `src/core/` – `SampleBlock`, `DataSource`, `RingBuffer`, time helpers. The contracts everything depends on.
- `src/io/` – parsers (LVM, CSV, XLSX) and CSV export.
- `src/sources/` – `ReplaySource`, `SyntheticSource`, later `BleSource`.
- `src/plot/` – uPlot wrapper, min/max decimation, render loop.
- `src/recording/` – IndexedDB recorder and markers (M4).
- `src/ble/` – Web Bluetooth connection and packet decoder (M5).
- `src/state/`, `src/ui/` – zustand store and React components.
- `public/samples/` – recordings for the replay source. `local/` is git-ignored (see Data privacy).
- `scripts/` – Node scripts (fixtures, xlsx → csv conversion).
- `tests/` – `unit/`, `fixtures/` (synthetic, committed), `e2e/`.
- `docs/` – architecture, data formats, BLE protocol, roadmap, open questions, weekly updates.

Some folders have their own `CLAUDE.md` with local rules. Read it before editing that folder.

## Architecture principles (do not break these)

1. **Time is the sample index**, never `Date.now()`. Each channel has its own `fs` and its own index,
   `t = sampleIndex / fs`. Index 0 of every channel is the same instant, which keeps ECG and SCG aligned in seconds.
2. **One `DataSource` interface** for every source. Switching from replay to BLE changes only the source.
3. **`SampleBlock`** = `{ channel, seq, firstSampleIndex, fs, samples: Float32Array }`, one channel per block, volts.
4. **Ring buffers** (`Float32Array`, 30 s per channel), preallocated, no allocations in the hot path.
5. **Plot** with uPlot, min/max decimation per pixel, redrawn in one `requestAnimationFrame` loop,
   never through React state. Y axis autoscales on the visible window. Volts are converted to mV only for display.
6. **Raw is sacred.** Raw samples are recorded and exported. Missing samples are `NaN`, never skipped.
7. **Pause freezes the display only.** Acquisition and recording keep running.

Details: `docs/architecture.md` and `src/core/CLAUDE.md`.

## Data privacy

Real ECG/SCG recordings are personal health data and the GitHub Pages site is public.

- Real recordings live only in `public/samples/local/` (git-ignored). The build deletes `dist/samples/local/`.
- Use neutral names (`ecg_subject01`), never a person's name. Do not copy names, dates or operators into code or docs.
- Tests use synthetic fixtures only (`tests/fixtures/`, made by `scripts/make-fixtures.mjs`).

## How to work with the user

- The user is a **beginner with TypeScript/React**. Keep code simple and explicit: small files, descriptive names,
  no clever abstractions, no premature generalization. Comment the "why", not the "what".
- After each change, explain in your reply **in Italian**, in 3–5 lines, what you did and why.
  Code, comments, commit messages and docs stay **in English** (the lab reads them).
- Use plan mode for anything larger than a small fix. Propose the plan and wait for approval.
- When a decision depends on unknown hardware/firmware facts, do not guess silently: add the question to
  `docs/questions-for-team.md` and use a clearly marked placeholder (`// PLACEHOLDER(Qn): …`).

## Definition of Done (for every change)

- `npm run typecheck`, `npm run lint` and `npm test` pass.
- New logic has unit tests. Parsers, ring buffers, sources and the BLE decoder must always be tested.
- UI changes are checked in the running app (skill `run-app`).
- `docs/roadmap.md` is updated when a milestone task is completed.
- Interface or format changes are reflected in `docs/architecture.md`, `docs/data-formats.md` or `docs/ble-protocol.md`.

## Claude Code tooling in this repo

- Skills (`.claude/skills/`): `run-app`, `add-data-source`, `import-recording`, `weekly-update`.
  `ble-protocol` is added in M5.
- Agents (`.claude/agents/`): `perf-auditor` (plot/buffer performance), `test-writer` (Vitest tests).
  `ble-integration-reviewer` is added in M5.
- Hooks (`.claude/settings.json`): Prettier on every edited file, typecheck when Claude finishes a turn.
