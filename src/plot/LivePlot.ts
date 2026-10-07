// A scrolling uPlot chart for one channel, fed directly from a RingBuffer (rules: src/plot/CLAUDE.md).
// No React here: React mounts it once, then the shared render loop calls draw() every frame.
import uPlot from 'uplot'
import 'uplot/dist/uPlot.min.css'
import type { RingBuffer } from '../core/ringBuffer.ts'
import { updateYRange, type YRange } from './autoscale.ts'
import { decimateMinMax } from './decimate.ts'

const VOLTS_TO_MILLIVOLTS = 1000 // samples are stored in volts, shown in mV

export interface LivePlotOptions {
  color: string // CSS color of the trace
  axisColor: string
  gridColor: string
}

export class LivePlot {
  private readonly plot: uPlot
  private readonly resizeObserver: ResizeObserver

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

  constructor(container: HTMLElement, options: LivePlotOptions) {
    const axis = {
      stroke: options.axisColor,
      grid: { stroke: options.gridColor, width: 1 },
      ticks: { stroke: options.gridColor, width: 1 },
    }
    this.plot = new uPlot(
      {
        width: container.clientWidth,
        height: container.clientHeight,
        // Both scales are set by draw(): X follows the newest sample, Y autoscales on the window.
        scales: { x: { time: false, auto: false }, y: { auto: false } },
        axes: [
          { ...axis, label: 'Time (s)' },
          { ...axis, label: 'mV', size: 60 },
        ],
        series: [{}, { stroke: options.color, width: 1, spanGaps: false, points: { show: false } }],
        legend: { show: false },
        cursor: { show: false },
      },
      this.data,
      container,
    )

    this.resizeObserver = new ResizeObserver(() => {
      this.plot.setSize({ width: container.clientWidth, height: container.clientHeight })
      this.lastEndIndex = -1 // redraw at the new width
    })
    this.resizeObserver.observe(container)
  }

  /** Shows the last `windowSeconds` of `buffer`. Cheap when nothing changed since the last call. */
  draw(buffer: RingBuffer, fs: number, windowSeconds: number): void {
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
    // The replay emits every ~20 ms, so about one frame in three has no new samples.
    if (buffer.endIndex === this.lastEndIndex) return
    this.lastEndIndex = buffer.endIndex

    // At the start the trace fills 0…window, then it scrolls with the newest sample on the right.
    const startIndex = Math.max(0, buffer.endIndex - windowSamples)
    buffer.copyRange(startIndex, this.window)
    const count = decimateMinMax(
      this.window,
      startIndex,
      fs,
      buckets,
      VOLTS_TO_MILLIVOLTS,
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

    this.xRange.min = startIndex / fs
    this.xRange.max = this.xRange.min + windowSeconds
    this.plot.batch(() => {
      this.plot.setData(this.data, false)
      this.plot.setScale('x', this.xRange)
      if (!Number.isNaN(this.yRange.min)) this.plot.setScale('y', this.yRange)
    })
  }

  destroy(): void {
    this.resizeObserver.disconnect()
    this.plot.destroy()
  }

  private allocate(windowSamples: number, buckets: number): void {
    this.windowSamples = windowSamples
    this.buckets = buckets
    // Same rule as decimateMinMax: every sample if they fit, otherwise 2 points per pixel.
    const points = windowSamples <= 2 * buckets ? windowSamples : 2 * buckets
    this.window = new Float32Array(windowSamples)
    this.xs = new Float64Array(points)
    this.ys = new Array<number | null>(points).fill(null)
    this.data = [this.xs, this.ys]
    this.lastEndIndex = -1
  }
}
