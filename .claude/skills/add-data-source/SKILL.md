---
name: add-data-source
description: Checklist for adding a new DataSource (replay, synthetic, BLE or other) to the ECG/SCG monitor. Use whenever a new source of samples is created or an existing source's contract changes.
---

# Add a data source

Read `src/core/CLAUDE.md` and `src/sources/CLAUDE.md` first.

1. Create `src/sources/<name>Source.ts` implementing `DataSource` from `src/core/types.ts`.
   - Declare `channels` with the real `fs` of each channel.
   - `start()`: status `connecting` → `running`; restart every channel's sample index and `seq` at 0.
   - Emit one `SampleBlock` per channel per tick, values in **volts**, `Float32Array`.
   - `stop()`: synchronous, idempotent, clears timers/listeners, status `idle`, no blocks afterwards.
   - Missing samples → `NaN` (never skip indices).
2. Do not import React, the store, the plot or the recorder from the source.
3. Tests in `tests/unit/<name>Source.test.ts` with `vi.useFakeTimers()`:
   - correct number of samples after N simulated seconds (±1 tick),
   - `firstSampleIndex` continuous between blocks, `seq` grows by 1,
   - `stop()` idempotent and no blocks after `stop()`,
   - status transitions.
4. Register the source in the UI source picker (`src/ui/`).
5. Update the "Sources" table in `docs/architecture.md`.
6. Run `npm run typecheck && npm run lint && npm test`, then the skill `run-app`.
