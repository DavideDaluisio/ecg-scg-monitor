# src/plot – real-time plotting

## Performance budget
- 60 fps target, so each frame has 16 ms in total. The plot update itself should take **< 8 ms** with 2 channels at 3 kHz
  (the worst case; real hardware may send ECG at a lower rate).
- Measure, don't guess: ask the `perf-auditor` agent after changes here.

## Rules
- uPlot instances are created once and kept in a React `ref`. Update them with `setData()` inside a
  single `requestAnimationFrame` loop. **Never** push samples through React state or props.
- **Min/max decimation**: for a window of W samples drawn on P pixels, emit min and max per pixel bucket
  (about 2·P points). This preserves R peaks that plain downsampling would drop.
- Preallocate the decimation output arrays and reuse them every frame.
- Two display modes:
  - `scrolling`: newest data on the right, axis moves.
  - `sweep`: hospital-monitor style, a cursor sweeps left→right overwriting old data with a small gap.
- Default window: 5 s. Y axis in **mV**, auto-scale with hysteresis (no jumping each frame) or a fixed range.
- ECG and SCG panels share the same X range **in seconds**. Each panel converts its own sample index with its own fs
  (`t = index / fs`); channels may have different fs, so never share a sample-index range between panels.
  Pausing or zooming one applies to both.
- `NaN` samples render as gaps.
