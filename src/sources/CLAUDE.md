# src/sources – data sources

Every source implements `DataSource` from `src/core/types.ts`. Use the skill `add-data-source` to add a new one.

## Rules

- A source only **emits `SampleBlock`s**. It never touches the plot, the store or the recorder directly.
- Indices restart at 0 on every `start()`. `seq` starts at 0 and grows by 1 per block, per channel.
- **Pacing (`pacer.ts`, shared by replay and synthetic):** a timer every ~20 ms asks `Pacer.elapsedSeconds()` and
  emits, per channel, the samples that "should" exist by now: `due = floor(elapsedSeconds × fs)`, emit
  `due − emitted`. The clock is `performance.now()` (pacing only, never as a sample timestamp). This compensates
  timer drift: 24 s of file = 24 s on screen. One call advances at most 1 s (e.g. after the tab was in the
  background); the skip is logged and the signal continues from where it was.
- **Several channels = one source.** `ReplaySource` takes one track per channel; `SyntheticSource` generates ECG +
  SCG. One timer and one `Pacer` per source, so every channel has the **same start instant** and index 0 is aligned.
  Two files that were not recorded together are only a demo: the UI must say they are not simultaneous.
- **Looping:** replay loops by default, each track on its own length; the sample index keeps growing across loops
  (no reset). Without loop the source is `ended` when every track is over.
- **Synthetic model (`syntheticSignals.ts`, pure functions):** R peak of beat k at `0.3 + k × 60 / HR` s; the SCG AO
  burst is centered on `R + rToAo`, so its **highest peak** is exactly there (the demo files instead _start_ their
  burst 80 ms after R). Noise is optional and seeded: the same settings always give the same samples. Each block is a
  new `Float32Array` (consumers such as the M4 recorder may keep it).
- Tests use `vi.useFakeTimers()` and the synthetic fixtures. Test: pacing over 10 s, loop, stop() idempotent,
  no blocks after stop().
