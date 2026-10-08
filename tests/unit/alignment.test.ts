// M3 "done when": the synthetic R→AO delay read on the plot matches the configured one (±1 sample).
// The test runs the same path as the app: SyntheticSource → RingBuffer → shared window → min/max decimation
// (computePlotPoints, also used by LivePlot), then reads the R and AO peaks on the points that would be drawn.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RingBuffer } from '../../src/core/ringBuffer.ts'
import type { ChannelId } from '../../src/core/types.ts'
import { computePlotPoints, plotPointCount, visibleWindowStart } from '../../src/plot/plotPoints.ts'
import { SyntheticSource } from '../../src/sources/SyntheticSource.ts'

const BUFFER_SECONDS = 30 // as in src/state/session.ts

interface PlotPoints {
  xs: Float64Array // seconds
  ys: (number | null)[] // mV
  count: number
}

// What one panel would draw for the window [windowStartS, windowStartS + windowSeconds].
function plotPoints(
  buffer: RingBuffer,
  fs: number,
  windowStartS: number,
  windowSeconds: number,
  buckets: number,
): PlotPoints {
  const window = new Float32Array(Math.round(windowSeconds * fs))
  const points = plotPointCount(window.length, buckets)
  const xs = new Float64Array(points)
  const ys = new Array<number | null>(points).fill(null)
  const count = computePlotPoints(buffer, fs, windowStartS, window, buckets, xs, ys)
  return { xs, ys, count }
}

// Times of the R peaks: the highest point of each run of points above half the largest ECG value.
function findRPeaks(ecg: PlotPoints): number[] {
  let largest = -Infinity
  for (let i = 0; i < ecg.count; i++) largest = Math.max(largest, ecg.ys[i] ?? -Infinity)
  const threshold = largest / 2

  const peaks: number[] = []
  let peakX = NaN
  let peakY = -Infinity
  for (let i = 0; i < ecg.count; i++) {
    const y = ecg.ys[i]
    if (y !== null && y > threshold) {
      if (y > peakY) {
        peakY = y
        peakX = ecg.xs[i]
      }
    } else if (peakY > -Infinity) {
      peaks.push(peakX) // the run is over
      peakY = -Infinity
    }
  }
  return peaks
}

// Time of the highest SCG point in (fromS, toS]: the AO peak when the range starts at an R peak.
function findHighestPoint(scg: PlotPoints, fromS: number, toS: number): number {
  let bestX = NaN
  let bestY = -Infinity
  for (let i = 0; i < scg.count; i++) {
    const y = scg.ys[i]
    if (scg.xs[i] > fromS && scg.xs[i] <= toS && y !== null && y > bestY) {
      bestY = y
      bestX = scg.xs[i]
    }
  }
  return bestX
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('R→AO delay read on the plotted points (M3)', () => {
  it.each([
    { hr: 72, rToAoMs: 80, ecgFs: 3000, scgFs: 3000, windowS: 10, buckets: 1000, runS: 12.3 },
    { hr: 60, rToAoMs: 100, ecgFs: 500, scgFs: 3000, windowS: 5, buckets: 700, runS: 8.77 },
    { hr: 90, rToAoMs: 120, ecgFs: 3000, scgFs: 1000, windowS: 10, buckets: 1500, runS: 10.5 },
    { hr: 150, rToAoMs: 50, ecgFs: 250, scgFs: 2000, windowS: 5, buckets: 400, runS: 7.1 },
  ])(
    '$hr bpm, R→AO $rToAoMs ms, ECG $ecgFs Hz, SCG $scgFs Hz, window $windowS s on $buckets px',
    async (c) => {
      const source = new SyntheticSource({
        heartRateBpm: c.hr,
        rToAoS: c.rToAoMs / 1000,
        ecgFs: c.ecgFs,
        scgFs: c.scgFs,
        now: () => Date.now(),
      })
      const buffers: Record<ChannelId, RingBuffer> = {
        ecg: new RingBuffer(BUFFER_SECONDS * c.ecgFs),
        scg: new RingBuffer(BUFFER_SECONDS * c.scgFs),
      }
      source.onBlock((block) => buffers[block.channel].push(block.firstSampleIndex, block.samples))
      await source.start()
      vi.advanceTimersByTime(c.runS * 1000)
      source.stop()

      // The shared window, computed as in the app (getSessionEndSeconds: the newest instant of any channel).
      const endS = Math.max(buffers.ecg.endIndex / c.ecgFs, buffers.scg.endIndex / c.scgFs)
      const windowStartS = visibleWindowStart(endS, c.windowS)
      const ecg = plotPoints(buffers.ecg, c.ecgFs, windowStartS, c.windowS, c.buckets)
      const scg = plotPoints(buffers.scg, c.scgFs, windowStartS, c.windowS, c.buckets)

      // Shared X axis: every point of both panels lies in the same window (± half of its own sample).
      for (const [points, fs] of [
        [ecg, c.ecgFs],
        [scg, c.scgFs],
      ] as const) {
        expect(points.xs[0]).toBeGreaterThanOrEqual(windowStartS - 0.5 / fs - 1e-9)
        expect(points.xs[points.count - 1]).toBeLessThanOrEqual(windowStartS + c.windowS)
      }

      // Beats cut by the window edges are skipped.
      const rPeaks = findRPeaks(ecg).filter((r) => r > windowStartS + 0.05 && r + 0.2 < endS)
      expect(rPeaks.length).toBeGreaterThanOrEqual(3)

      const oneSampleS = 1 / Math.min(c.ecgFs, c.scgFs)
      for (const r of rPeaks) {
        const ao = findHighestPoint(scg, r, r + 0.2)
        expect(Math.abs(ao - r - c.rToAoMs / 1000)).toBeLessThanOrEqual(oneSampleS + 1e-9)
      }
    },
  )
})
