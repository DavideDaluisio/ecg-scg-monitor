# src/sources – data sources

Every source implements `DataSource` from `src/core/types.ts`. Use the skill `add-data-source` to add a new one.

## Rules

- A source only **emits `SampleBlock`s**. It never touches the plot, the store or the recorder directly.
- Indices restart at 0 on every `start()`. `seq` starts at 0 and grows by 1 per block, per channel.
- **Replay pacing:** a timer every ~20 ms emits the samples that "should" exist by now:
  `due = floor(elapsedSeconds × fs)`, emit `due − emitted`. `elapsedSeconds` comes from `performance.now()`
  (pacing only, never as a sample timestamp). This compensates timer drift: 24 s of file = 24 s on screen.
  Cap one tick at ~1 s of samples (e.g. after the tab was in the background) and log the skip.
- **Looping:** replay loops by default; the sample index keeps growing across loops (no reset).
- When several channels replay together, all of them use the **same start instant**, so index 0 is aligned.
  Two files that were not recorded together are only a demo: the UI must say they are not simultaneous.
- Tests use `vi.useFakeTimers()` and the synthetic fixtures. Test: pacing over 10 s, loop, stop() idempotent,
  no blocks after stop().
