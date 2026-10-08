// A scrolling uPlot chart for one channel, fed directly from a RingBuffer (rules: src/plot/CLAUDE.md).
// No React here: React mounts it once, then the shared render loop calls draw() every frame.
import uPlot from 'uplot'
import 'uplot/dist/uPlot.min.css'
import type { RingBuffer } from '../core/ringBuffer.ts'
import { updateYRange, type YRange } from './autoscale.ts'
import { computePlotPoints, plotPointCount } from './plotPoints.ts'

// Every LivePlot uses this key, so uPlot moves their cursors together: one vertical line crosses all panels
// at the same time, which makes the delay between ECG and SCG features visible.
const CURSOR_SYNC_KEY = 'live-panels'

export interface LivePlotOptions {
  color: string // CSS color of the trace
  axisColor: string
  gridColor: string
}

export class LivePlot {
  private readonly plot: uPlot
  private readonly resizeObserver: ResizeObserver
  private readonly readout: HTMLDivElement // time and value under the cursor
  private readoutText = ''

  // Preallocated arrays, recreated only when the window length or the plot width changes.
  private windowSamples = 0
  private buckets = 0
  private window = new Float32Array(0) // raw samples of the visible window (volts)
  private xs = new Float64Array(0) // seconds
  private ys: (number | null)[] = [] // mV, null = gap
  private data: uPlot.AlignedData = [this.xs, this.ys]

  private readonly yRange: YRange = { min: NaN, max: NaN }
  private readonly xRange = { min: 0, max: 0 }
  private lastBuffer: RingBuffer | null = null
  private lastEndIndex = -1
  private lastWindowStartS = -1

  constructor(container: HTMLElement, options: LivePlotOptions) {
    // Created before the chart, because uPlot may call the cursor hook while it starts.
    this.readout = document.createElement('div')
    this.readout.className = 'cursor-readout'
    this.readout.dataset.testid = 'cursor-readout'

    const axis = {
      stroke: options.axisColor,
      grid: { stroke: options.gridColor, width: 1 },
      ticks: { stroke: options.gridColor, width: 1 },
    }
    this.plot = new uPlot(
      {
        width: container.clientWidth,
        height: container.clientHeight,
        // Both scales are set by draw(): X is the shared window, Y autoscales on the window.
        scales: { x: { time: false, auto: false }, y: { auto: false } },
        axes: [
          { ...axis, label: 'Time (s)' },
          // Fixed width, so the plot areas of all panels start at the same pixel and their X axes line up.
          { ...axis, label: 'mV', size: 60 },
        ],
        series: [{}, { stroke: options.color, width: 1, spanGaps: false, points: { show: false } }],
        legend: { show: false },
        cursor: {
          sync: { key: CURSOR_SYNC_KEY },
          y: false, // vertical line only
          // No drag-to-zoom: draw() sets the X range every frame.
          drag: { x: false, y: false, setScale: false },
        },
        hooks: { setCursor: [(u) => this.updateReadout(u)] },
      },
      this.data,
      container,
    )
    container.appendChild(this.readout)

    this.resizeObserver = new ResizeObserver(() => {
      this.plot.setSize({ width: container.clientWidth, height: container.clientHeight })
      this.lastEndIndex = -1 // redraw at the new width
    })
    this.resizeObserver.observe(container)
  }

  /**
   * Shows the samples of `buffer` in [windowStartS, windowStartS + windowSeconds]. Every panel gets the same
   * window, so their X axes are identical. Cheap when nothing changed since the last call.
   */
  draw(buffer: RingBuffer, fs: number, windowStartS: number, windowSeconds: number): void {
    const windowSamples = Math.round(windowSeconds * fs)
    // Plot area width in CSS pixels (bbox is in canvas pixels): one min/max bucket per pixel.
    const buckets = Math.max(1, Math.round(this.plot.bbox.width / uPlot.pxRatio))

    if (buffer !== this.lastBuffer) {
      // New session: start the Y autoscale from scratch.
      this.lastBuffer = buffer
      this.yRange.min = NaN
      this.yRange.max = NaN
      this.lastEndIndex = -1
    }
    if (windowSamples !== this.windowSamples || buckets !== this.buckets) {
      this.allocate(windowSamples, buckets)
    }
    // The sources emit every ~20 ms, so about one frame in three has no new samples.
    if (buffer.endIndex === this.lastEndIndex && windowStartS === this.lastWindowStartS) return
    this.lastEndIndex = buffer.endIndex
    this.lastWindowStartS = windowStartS

    const count = computePlotPoints(
      buffer,
      fs,
      windowStartS,
      this.window,
      buckets,
      this.xs,
      this.ys,
    )

    let dataMin = NaN
    let dataMax = NaN
    for (let i = 0; i < count; i++) {
      const y = this.ys[i]
      if (y === null) continue
      if (!(y >= dataMin)) dataMin = y // also true when dataMin is still NaN
      if (!(y <= dataMax)) dataMax = y
    }
    updateYRange(this.yRange, dataMin, dataMax)

    this.xRange.min = windowStartS
    this.xRange.max = windowStartS + windowSeconds
    this.plot.batch(() => {
      this.plot.setData(this.data, false)
      this.plot.setScale('x', this.xRange)
      if (!Number.isNaN(this.yRange.min)) this.plot.setScale('y', this.yRange)
    })
  }

  destroy(): void {
    this.resizeObserver.disconnect()
    this.plot.destroy()
    this.readout.remove()
  }

  private allocate(windowSamples: number, buckets: number): void {
    this.windowSamples = windowSamples
    this.buckets = buckets
    const points = plotPointCount(windowSamples, buckets)
    this.window = new Float32Array(windowSamples)
    this.xs = new Float64Array(points)
    this.ys = new Array<number | null>(points).fill(null)
    this.data = [this.xs, this.ys]
    this.lastEndIndex = -1
  }

  // Shows the time and value of the drawn point nearest to the cursor. The time is that of a real sample
  // (min/max decimation keeps the exact sample of each peak), so peaks can be read to the sample.
  private updateReadout(u: uPlot): void {
    const index = u.cursor.idx
    let text = ''
    if (index !== null && index !== undefined) {
      const t = u.data[0][index]
      const value = u.data[1][index]
      text = `t = ${t.toFixed(4)} s`
      if (value !== null && value !== undefined) text += ` · ${value.toFixed(3)} mV`
    }
    // Touch the DOM only when the text changes.
    if (text !== this.readoutText) {
      this.readoutText = text
      this.readout.textContent = text
    }
  }
}
