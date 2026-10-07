# src/plot – real-time plotting

Performance is the main risk of this app: 2 channels × 3000 Hz × 10 s window = 60,000 points per frame.

## Rules

- Samples **never go through React state**. React mounts the plot once; one `requestAnimationFrame` loop
  reads the ring buffers and calls `uplot.setData()` directly.
- **Min/max decimation per pixel**: for each horizontal pixel keep the min and max of the samples it covers
  (2 points per pixel). This keeps the QRS peaks visible, unlike plain downsampling.
- **No allocations per frame**: preallocate the arrays passed to uPlot and the scratch buffers, and reuse them.
- X axis = seconds (`sampleIndex / fs`), Y axis = mV (volts × 1000, display only).
- Y axis autoscales on the visible window (min/max with ~10 % padding, smoothed so it does not jump each frame).
- When the display is paused, the loop stops updating but acquisition continues.
- Target: steady 60 fps on a mid-range laptop and Android phone. Ask the `perf-auditor` agent after changes here.
