# Roadmap

Order requested by the supervisor: ECG first, then SCG, then both together. Status: `todo` / `wip` / `done`.

| #   | Milestone                          | Status | Done when                                                                                 |
| --- | ---------------------------------- | ------ | ----------------------------------------------------------------------------------------- |
| M0  | Scaffold                           | done   | GitHub Pages shows the app shell, CI green                                                |
| M1  | ECG live (replay)                  | done   | 24 s of file = 24 s on screen, smooth 60 fps, tests green, e2e smoke ok                   |
| M2  | SCG live                           | done   | SCG file scrolls like the ECG, parser tests green                                         |
| M3  | ECG + SCG together (paper Fig. 1F) | done   | synthetic R→AO delay read on the plot matches the configured one (±1 sample)              |
| M4  | Recording, markers, export         | todo   | 5-min export re-read in Python with samples and markers at the right index                |
| M5  | BLE (BL653µ)                       | todo   | packetized-synthetic decoder tests green; with hardware: 10 min stable, < 1 % packet loss |

## M0 – Scaffold

- [x] Vite + React + TypeScript template, dependencies, npm scripts
- [x] `vite.config.ts` (`base: '/ecg-scg-monitor/'`, strip `dist/samples/local/`), Vitest and Playwright config
- [x] CLAUDE.md (root, `src/core`, `src/sources`, `src/plot`), skills, agents, hooks
- [x] Docs: architecture, data formats, BLE protocol draft, open questions, roadmap
- [x] `scripts/make-fixtures.mjs` + synthetic fixtures, `scripts/convert-xlsx.mjs`
- [x] Local recordings in `public/samples/local/` (git-ignored, neutral names)
- [x] App shell + e2e smoke test
- [x] CI (`ci.yml`) and Pages deploy (`deploy.yml`) workflows
- [x] Create the GitHub repo, push, enable Pages (Settings → Pages → Source: GitHub Actions)

## M1 – ECG live (replay)

- [x] `src/core`: `types.ts`, `time.ts`, `ringBuffer.ts` (+ tests, incl. wrap-around)
- [x] `src/io/lvm.ts` parser (+ tests on `tests/fixtures/ecg_synthetic.lvm`: 6,000 samples, fs 3000, `Samples` quirk)
- [x] `ReplaySource` with drift-compensated pacing and looping (+ fake-timer tests)
- [x] `src/plot`: uPlot panel, min/max decimation (+ tests), render loop, autoscale Y, mV axis
- [x] UI: recording picker (local samples or open file from disk), Start/Stop, Pause display, status badge, window 5/10 s
- [x] e2e: start replay of the synthetic file, canvas visible, status `running`
- [x] Screenshot + weekly update for the meeting

## M2 – SCG live

- [x] `src/io/csv.ts` + lazy `src/io/xlsx.ts` (+ tests on `scg_synthetic.csv`)
- [x] Generic channel panel component, SCG panel
- [x] Public synthetic SCG demo (`scg_synthetic_demo.csv`), "Open ECG file…" / "Open SCG file…", e2e

## M3 – ECG + SCG together

- [x] `SyntheticSource` (PQRST + SCG AO/AC, seeded, configurable HR, R→AO delay and fs per channel) + settings form
- [x] Dual replay (two non-simultaneous files started together, labeled "not simultaneous" in the UI)
- [x] Two stacked panels, shared X axis in seconds, synchronized pause
- [x] Cursor synchronized across the panels, with the time and value of the point under it
- [x] `tests/unit/alignment.test.ts`: R→AO read on the plotted points = configured ±1 sample (4 HR/delay/fs sets)

## M4 – Recording, markers, export

- [ ] IndexedDB recorder (raw chunks), session list, delete
- [ ] Marker button (preset labels + free text), vertical lines on the plot
- [ ] CSV export (one file per channel if fs differ) + Python check script in `scripts/`

## M5 – BLE

- [ ] Protocol agreed with Arsh (`docs/ble-protocol.md` v1)
- [ ] `src/ble/CLAUDE.md`, skill `ble-protocol`, agent `ble-integration-reviewer`
- [ ] Decoder + test encoder + packetized synthetic mode
- [ ] `BleSource`: connect, notify, lost packets → NaN, reconnect, link-quality indicator
- [ ] Hardware test with the BL653µ dev kit
