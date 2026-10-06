# Roadmap

Order requested by the supervisor: ECG first, then SCG, then both together. Status: `todo` / `wip` / `done`.

| # | Milestone | Status | Done when |
|---|---|---|---|
| M0 | Scaffold | wip | GitHub Pages shows the app shell, CI green |
| M1 | ECG live (replay) | todo | ECG sample scrolls smoothly at 60 fps, 24 s of file = 24 s on screen |
| M2 | SCG live | todo | SCG sample scrolls smoothly, parser tests green |
| M3 | ECG + SCG together | todo | two synchronized panels like paper Fig. 1F, synthetic R→AO delay visible and correct |
| M4 | Filters + heart rate | todo | synthetic HR detected ±1 bpm, filter tests vs scipy green |
| M5 | Recording, markers, export | todo | 5-min export re-imported in Python with samples and markers at the right index |
| M6 | BLE | todo | decoder passes packetized-synthetic tests; with hardware: 10 min stable, < 1% packet loss |

## M0 – Scaffold
- [x] Folder structure, CLAUDE.md files, skills, agents, `.claude/settings.json` + hooks
- [x] Docs: architecture, data formats, BLE protocol draft, open questions, ADR 0001
- [x] Sample data in `public/samples/` + `manifest.json`
- [ ] `npm create vite@latest` (react-ts) into this folder, keeping the existing files
- [ ] Dependencies: uplot, zustand, idb, vite-plugin-pwa, xlsx; dev: vitest, @playwright/test, eslint, prettier, tsx, @types/web-bluetooth
- [ ] Scripts in `package.json`: dev, build, preview, test, e2e, lint, typecheck, format
- [ ] `vite.config.ts` with `base: '/ecg-scg-monitor/'` and the PWA plugin
- [ ] `scripts/convert-samples.ts` (xlsx → csv), reproducing `public/samples/scg_sunny.csv`
- [ ] `.github/workflows/ci.yml` (lint, typecheck, test, build) and `deploy.yml` (GitHub Pages)
- [ ] `git init`, first commit, create the GitHub repo, push, enable Pages

## M1 – ECG live (replay)
- [ ] `src/core`: types (incl. `SourceStatus`, ADR 0002) + `RingBuffer` (+ tests)
- [ ] `src/io/lvm.ts` parser (+ test on `ecg_sunny.lvm`: 72,000 samples, fs 3000)
- [ ] `ReplaySource` with drift-compensated pacing and looping (+ fake-timer tests)
- [ ] `src/plot`: uPlot panel, min/max decimation, scrolling + sweep, mV axis
- [ ] UI: source picker, start/stop, pause = freeze display, status badge, window length
- [ ] e2e smoke test

## M2 – SCG live
- [ ] `src/io/csv.ts` + lazy `xlsx` import (+ tests on `scg_sunny.csv`: 28,000 samples)
- [ ] SCG panel, generic channel panel component

## M3 – ECG + SCG together
- [ ] `SyntheticSource` (PQRST + AO/AC, seeded, configurable HR and R→AO delay)
- [ ] Two stacked panels, shared X axis, synchronized pause/zoom
- [ ] Screenshot for the weekly update (Fig. 1F equivalent)

## M4 – Filters + HR
- [ ] scipy reference fixtures, biquad + chains in a worker, raw/filtered toggle
- [ ] Pan-Tompkins HR + badge, filter settings panel

## M5 – Recording, markers, export
- [ ] IndexedDB recorder, marker button with labels, session list
- [ ] CSV + LVM export, re-import test

## M6 – BLE
- [ ] Protocol agreed with Arsh (`docs/ble-protocol.md` v1)
- [ ] Decoder + encoder + packetized synthetic mode
- [ ] `BleSource`: connect, notify, reconnect, link-quality indicator
- [ ] Hardware test with the BL653µ dev kit
