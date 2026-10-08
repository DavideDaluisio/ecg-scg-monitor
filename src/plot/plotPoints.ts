// What one panel draws in a frame, as pure functions (no uPlot, no DOM). LivePlot uses them, and so does the
// alignment test (tests/unit/alignment.test.ts), which therefore measures exactly the points that are drawn.
import type { RingBuffer } from '../core/ringBuffer.ts'
import { secondsToSampleIndex } from '../core/time.ts'
import { decimateMinMax } from './decimate.ts'

const VOLTS_TO_MILLIVOLTS = 1000 // samples are stored in volts, shown in mV

/**
 * Start (s) of the visible window, the same for every panel (shared X axis).
 * `endS` is the newest instant of the session: at the start the trace fills 0…W, then it scrolls.
 */
export function visibleWindowStart(endS: number, windowSeconds: number): number {
  return Math.max(0, endS - windowSeconds)
}

/** Number of points drawn for a window: every sample if they fit, otherwise 2 per pixel (min and max). */
export function plotPointCount(windowSamples: number, buckets: number): number {
  return windowSamples <= 2 * buckets ? windowSamples : 2 * buckets
}

/**
 * Fills xs (seconds) and ys (mV, null = gap) with the window that starts at `windowStartS`.
 * `window` is the caller's scratch array: its length is the number of samples in the window (W × fs).
 * Returns the number of points written (= plotPointCount(window.length, buckets)).
 */
export function computePlotPoints(
  buffer: RingBuffer,
  fs: number,
  windowStartS: number,
  window: Float32Array,
  buckets: number,
  xs: Float64Array,
  ys: (number | null)[],
): number {
  // Each channel converts the shared start time to its own sample index (channels may have different fs).
  const startIndex = secondsToSampleIndex(windowStartS, fs)
  buffer.copyRange(startIndex, window) // samples not received yet become NaN (drawn as a gap)
  return decimateMinMax(window, startIndex, fs, buckets, VOLTS_TO_MILLIVOLTS, xs, ys)
}
