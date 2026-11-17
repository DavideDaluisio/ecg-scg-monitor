// A scrolling uPlot chart for one channel, fed directly from a RingBuffer (rules: src/plot/CLAUDE.md).
// No React here: React mounts it once, then the shared render loop calls draw() every frame.
import uPlot from 'uplot'
import 'uplot/dist/uPlot.min.css'
import type { PqrstBeat, WavePoint } from '../analysis/pqrstPoints.ts'
import type { RingBuffer } from '../core/ringBuffer.ts'
import { updateYRange, type YRange } from './autoscale.ts'
import { computePlotPoints, plotPointCount, VOLTS_TO_MILLIVOLTS } from './plotPoints.ts'

// Every LivePlot uses this key, so uPlot moves their cursors together: one vertical line crosses all panels
// at the same time, which makes the delay between ECG and SCG features visible.
const CURSOR_SYNC_KEY = 'live-panels'

// A beat's P and T waves are within 0.45 s of its R peak: beats whose R is farther than this (plus half a letter)
// outside the visible window have nothing to draw.
const PQRST_MARGIN_S = 0.5
// The "AO" label is centered on its dot: an AO just outside the window may still show half of it.
const AO_MARGIN_S = 0.1

export interface LivePlotOptions {
  color: string // CSS color of the trace
  axisColor: string
  gridColor: string
  markerColor: string
  symbolColor: string // P, Q, R, S, T symbols (ECG panel) and AO symbols (SCG panel)
}

/** A marker drawn as a vertical line on every panel, at the same instant (seconds on the shared X axis). */
export interface PlotMarker {
  timeS: number
  label: string
}

export class LivePlot {
  private readonly plot: uPlot
  private readonly resizeObserver: ResizeObserver
  private readonly readout: HTMLDivElement // time and value under the cursor
  private readoutText = ''

  // Marker lines, drawn by the uPlot draw hook. Style values are prepared once (no allocation per frame).
  private markers: readonly PlotMarker[] = []
  private readonly markerColor: string
  private readonly markerDash: number[]
  private readonly markerFont: string

  // Symbols of the detected waves: P, Q, R, S, T of each beat (ECG panel) and AO peaks (SCG panel). References to
  // the session's arrays, like the markers. Sample indices of this panel's channel.
  private beats: readonly PqrstBeat[] = []
  private aoPoints: readonly WavePoint[] = []
  private symbolsFs = 1
  // Newest R and AO known at the last draw(). The trackers keep adding points while the display is paused;
  // skipping the newer ones keeps a frozen frame unchanged when it is redrawn (checkbox, resize).
  private lastDrawnR = -Infinity
  private lastDrawnAo = -Infinity
  private symbolsVisible = true
  private readonly symbolColor: string
  private readonly symbolFont: string
  private readonly symbolFontSize: number // canvas pixels
  private readonly symbolRadius: number // of the dot on the sample
  private readonly symbolGap: number // between the dot and its letter

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
  private lastMarkersVersion = -1

  constructor(container: HTMLElement, options: LivePlotOptions) {
    // Created before the chart, because uPlot may call the cursor hook while it starts.
    this.readout = document.createElement('div')
    this.readout.className = 'cursor-readout'
    this.readout.dataset.testid = 'cursor-readout'
    this.markerColor = options.markerColor
    this.markerDash = [4 * uPlot.pxRatio, 4 * uPlot.pxRatio]
    this.markerFont = `${11 * uPlot.pxRatio}px system-ui, sans-serif`
    this.symbolColor = options.symbolColor
    this.symbolFontSize = 11 * uPlot.pxRatio
    this.symbolFont = `600 ${this.symbolFontSize}px system-ui, sans-serif`
    this.symbolRadius = 2.5 * uPlot.pxRatio
    this.symbolGap = 4 * uPlot.pxRatio

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
        hooks: {
          setCursor: [(u) => this.updateReadout(u)],
          draw: [(u) => this.drawMarkers(u), (u) => this.drawPqrst(u), (u) => this.drawAo(u)],
        },
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
   * Shows the samples of `buffer` in [windowStartS, windowStartS + windowSeconds], and the markers, the P, Q, R, S, T
   * symbols of `beats` and the AO symbols of `aoPoints` in that window. Every panel gets the same window, so their
   * X axes are identical. Cheap when nothing changed since the last call. `beats` and `aoPoints` change only when
   * new samples arrive, which also moves the window or this buffer's end, so the check below also covers them.
   */
  draw(
    buffer: RingBuffer,
    fs: number,
    windowStartS: number,
    windowSeconds: number,
    markers: readonly PlotMarker[],
    markersVersion: number, // changes when a marker is added, renamed or cleared
    beats: readonly PqrstBeat[], // empty on panels other than the ECG
    aoPoints: readonly WavePoint[], // empty on panels other than the SCG
  ): void {
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
    if (
      buffer.endIndex === this.lastEndIndex &&
      windowStartS === this.lastWindowStartS &&
      markersVersion === this.lastMarkersVersion
    ) {
      return
    }
    this.lastEndIndex = buffer.endIndex
    this.lastWindowStartS = windowStartS
    this.lastMarkersVersion = markersVersion
    this.markers = markers
    this.beats = beats
    this.aoPoints = aoPoints
    this.symbolsFs = fs
    this.lastDrawnR = beats.at(-1)?.r.sampleIndex ?? -Infinity
    this.lastDrawnAo = aoPoints.at(-1)?.sampleIndex ?? -Infinity

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

  /**
   * Shows or hides the wave symbols of this panel (P, Q, R, S, T on the ECG, AO on the SCG). Redraws at once, so it
   * also works on a paused (frozen) plot.
   */
  setSymbolsVisible(visible: boolean): void {
    if (visible === this.symbolsVisible) return
    this.symbolsVisible = visible
    // Same data and paths: only the draw hooks run again. Not when there is no symbol: nothing would change.
    if (this.beats.length > 0 || this.aoPoints.length > 0) this.plot.redraw(false)
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

  // Dashed vertical line + label for each marker inside the visible window. Called by uPlot after each redraw.
  private drawMarkers(u: uPlot): void {
    if (this.markers.length === 0) return
    const xMin = u.scales.x.min ?? 0
    const xMax = u.scales.x.max ?? 0
    const { left, top, width, height } = u.bbox // canvas pixels
    const ctx = u.ctx
    ctx.save()
    // Labels near the right edge must not spill over the axis.
    ctx.beginPath()
    ctx.rect(left, top, width, height)
    ctx.clip()
    ctx.strokeStyle = this.markerColor
    ctx.fillStyle = this.markerColor
    ctx.lineWidth = uPlot.pxRatio
    ctx.setLineDash(this.markerDash)
    ctx.font = this.markerFont
    ctx.textBaseline = 'top'
    for (const marker of this.markers) {
      if (marker.timeS < xMin || marker.timeS > xMax) continue
      const x = Math.round(u.valToPos(marker.timeS, 'x', true))
      ctx.beginPath()
      ctx.moveTo(x, top)
      ctx.lineTo(x, top + height)
      ctx.stroke()
      ctx.fillText(marker.label, x + 3 * uPlot.pxRatio, top + 2 * uPlot.pxRatio)
    }
    ctx.restore()
  }

  // A dot on the exact sample of each detected wave, and its letter: P, R, T above the trace, Q and S below
  // (see drawWave). Called by uPlot after each redraw. Beats are oldest first, so the loop walks back from the
  // newest and stops at the first beat left of the window.
  private drawPqrst(u: uPlot): void {
    if (!this.symbolsVisible || this.beats.length === 0) return
    const xMin = u.scales.x.min ?? 0
    const xMax = u.scales.x.max ?? 0
    this.startSymbols(u)
    for (let i = this.beats.length - 1; i >= 0; i--) {
      const beat = this.beats[i]
      if (beat.r.sampleIndex > this.lastDrawnR) continue // found after the last draw()
      const rS = beat.r.sampleIndex / this.symbolsFs
      if (rS > xMax + PQRST_MARGIN_S) continue
      if (rS < xMin - PQRST_MARGIN_S) break
      this.drawWave(u, beat.p, 'P', 'above')
      this.drawWave(u, beat.q, 'Q', 'below-left')
      this.drawWave(u, beat.r, 'R', 'above')
      this.drawWave(u, beat.s, 'S', 'below-right')
      this.drawWave(u, beat.t, 'T', 'above')
    }
    u.ctx.restore()
  }

  // A dot on the exact sample of each AO peak and the label "AO" above it, like the waves of drawPqrst.
  private drawAo(u: uPlot): void {
    if (!this.symbolsVisible || this.aoPoints.length === 0) return
    const xMin = u.scales.x.min ?? 0
    const xMax = u.scales.x.max ?? 0
    this.startSymbols(u)
    for (let i = this.aoPoints.length - 1; i >= 0; i--) {
      const point = this.aoPoints[i]
      if (point.sampleIndex > this.lastDrawnAo) continue // found after the last draw()
      const aoS = point.sampleIndex / this.symbolsFs
      if (aoS > xMax + AO_MARGIN_S) continue
      if (aoS < xMin - AO_MARGIN_S) break
      this.drawWave(u, point, 'AO', 'above')
    }
    u.ctx.restore()
  }

  // Saves the canvas state, clips to the plot area (no symbol over the axes) and sets the symbol style.
  // The caller draws its symbols, then calls u.ctx.restore().
  private startSymbols(u: uPlot): void {
    const { left, top, width, height } = u.bbox // canvas pixels
    const ctx = u.ctx
    ctx.save()
    ctx.beginPath()
    ctx.rect(left, top, width, height)
    ctx.clip()
    ctx.fillStyle = this.symbolColor
    ctx.font = this.symbolFont
  }

  // Dot + label of one wave (its letter, or "AO"). Q and S are only a few pixels apart, so the Q letter ends at its
  // dot (to the left) and the S letter starts at its dot (to the right): they never overlap. When the label has no
  // room above or below (R at the top of the plot, S at the bottom), it goes beside the dot instead of being cut off.
  private drawWave(
    u: uPlot,
    point: WavePoint | null,
    label: string,
    place: 'above' | 'below-left' | 'below-right',
  ): void {
    if (point === null) return
    const ctx = u.ctx
    // Whole pixels, like the marker lines: sharper letters, and no fractional number boxed by each canvas call.
    const x = Math.round(u.valToPos(point.sampleIndex / this.symbolsFs, 'x', true))
    const y = Math.round(u.valToPos(point.valueV * VOLTS_TO_MILLIVOLTS, 'y', true))
    ctx.beginPath()
    ctx.arc(x, y, this.symbolRadius, 0, 2 * Math.PI)
    ctx.fill()

    const offset = this.symbolRadius + this.symbolGap
    const { top, height } = u.bbox
    if (place === 'above') {
      if (y - offset - this.symbolFontSize >= top) {
        ctx.textAlign = 'center'
        ctx.textBaseline = 'bottom'
        ctx.fillText(label, x, y - offset)
      } else {
        ctx.textAlign = 'left'
        ctx.textBaseline = 'middle'
        ctx.fillText(label, x + offset, y)
      }
      return
    }
    const toTheLeft = place === 'below-left'
    ctx.textAlign = toTheLeft ? 'right' : 'left'
    if (y + offset + this.symbolFontSize <= top + height) {
      ctx.textBaseline = 'top'
      ctx.fillText(label, x, y + offset)
    } else {
      ctx.textBaseline = 'middle'
      ctx.fillText(label, toTheLeft ? x - offset : x + offset, y)
    }
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
