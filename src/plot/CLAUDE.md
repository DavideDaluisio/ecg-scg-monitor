# src/plot – real-time plotting

Performance is the main risk of this app: 2 channels × 3000 Hz × 10 s window = 60,000 points per frame.

## Rules

- Samples **never go through React state**. React mounts the plot once; one `requestAnimationFrame` loop
  reads the ring buffers and calls `uplot.setData()` directly.
- **Min/max decimation per pixel**: for each horizontal pixel keep the min and max of the samples it covers
  (2 points per pixel). This keeps the QRS peaks visible, unlike plain downsampling.
- **No allocations per frame**: preallocate the arrays passed to uPlot and the scratch buffers, and reuse them.
- X axis = seconds (`sampleIndex / fs`), Y axis = mV (volts × 1000, display only).
- **Shared X window:** every panel shows the same `[start, start + W]` in seconds (`visibleWindowStart` in
  `plotPoints.ts`, from the newest instant of the session). Never compute the window from one channel's own index.
- What a panel draws is computed by the pure `computePlotPoints` (`plotPoints.ts`), also used by
  `tests/unit/alignment.test.ts`: keep the drawing logic there, not inside `LivePlot`, so the test checks what is drawn.
- The uPlot cursor is synced across panels (same `cursor.sync.key`); drag-to-zoom stays off, because `draw()` sets the
  X range every frame. The readout is written to the DOM only when its text changes.
- Y axis autoscales on the visible window (min/max with ~10 % padding, smoothed so it does not jump each frame).
- When the display is paused, the loop stops updating but acquisition continues.
- Target: steady 60 fps on a mid-range laptop and Android phone. Ask the `perf-auditor` agent after changes here.
