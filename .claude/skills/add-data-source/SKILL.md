---
name: add-data-source
description: Checklist for adding or changing a DataSource (replay, synthetic, BLE, or a new one) in the ECG/SCG monitor. Use when creating a new signal source or changing how an existing source emits SampleBlocks.
---

# Add a data source

Read `src/core/CLAUDE.md` and `src/sources/CLAUDE.md` first.

1. Create `src/sources/<Name>Source.ts` implementing `DataSource` from `src/core`.
   - `info.channels` lists each channel with its own `fs` (`{ id, fs }`) and `units: 'V'`. Never assume all channels share one fs.
   - Blocks use the session sample index (`firstSampleIndex` starts at 0 on `start()`, continuous, never reset within a session).
   - Gaps are filled with `NaN`, not skipped.
   - `stop()` clears timers and listeners. Calling `start()` twice must not create two timers.
   - Implements `status` + `onStatus` following the lifecycle in `src/core/CLAUDE.md`
     (index 0 on each `start()`, no `pause()`, no blocks outside `'running'`).
2. Register it in the source picker (`src/ui/SourcePicker.tsx`) with a clear label.
   If the data is not a simultaneous ECG+SCG recording, say so in the label.
3. Unit test in `tests/unit/<name>Source.test.ts` using Vitest fake timers:
   - emitted sample count **per channel** matches `elapsed × fs` of that channel (±1 block)
   - `firstSampleIndex` of consecutive blocks of the same channel is contiguous
   - `stop()` stops emission and emits status `'idle'`
   - status goes `idle → connecting → running`; a failing load ends in `'error'`
   - after `stop()` + `start()` the first block of each channel has `firstSampleIndex === 0`
4. Update the source list in `docs/architecture.md`.
5. Run `npm run typecheck && npm test`, then the `run-app` skill with the new source selected.
6. Explain the change to the user in Italian (3–5 lines).
