// Live P, Q, R, S, T detection on the ECG channel of a session (display only: nothing is recorded or exported).
// session.ts feeds it every ECG block right after the block is written to the ring buffer. The QrsDetector finds
// each heartbeat; once the ring buffer holds the samples up to the end of the beat's T window, findPqrst locates
// the five waves on the raw samples. The symbols therefore appear ~0.6 s after the R peak.
import type { RingBuffer } from '../core/ringBuffer.ts'
import type { SampleBlock } from '../core/types.ts'
import { findPqrst, P_MAX_BEFORE_R_S, T_MAX_AFTER_R_S, type PqrstBeat } from './pqrstPoints.ts'
import { QrsDetector } from './qrsDetector.ts'

// R–R interval used for the first beat, or after a pause longer than MAX_RR_S (no reliable previous beat).
const DEFAULT_RR_S = 0.8
const MAX_RR_S = 2
// Beats kept for the plot: more than the 30 s ring buffer holds even at 200 bpm (100 beats), but bounded.
const MAX_BEATS = 300

export class PqrstTracker {
  /** Detected beats, oldest first. The plot keeps a reference to this array and reads it every redraw. */
  readonly beats: PqrstBeat[] = []

  private readonly buffer: RingBuffer
  private readonly fs: number
  private readonly detector: QrsDetector
  private readonly qrsSearchSamples: number
  private readonly lookBackSamples: number // from the QRS peak back to the earliest possible P sample
  private readonly waitSamples: number // from the QRS peak on to the latest possible T sample
  private readonly scratch: Float32Array // the raw samples of one beat, reused for every beat
  private readonly pendingPeaks: number[] = [] // QRS found, waiting for the samples of their T wave
  private previousPeakIndex = -Infinity
  private readonly onBeat: ((beat: PqrstBeat) => void) | undefined

  /** `onBeat` (optional) is called with every beat added to `beats`, e.g. to look for the AO on the SCG. */
  constructor(buffer: RingBuffer, fs: number, onBeat?: (beat: PqrstBeat) => void) {
    this.buffer = buffer
    this.fs = fs
    this.onBeat = onBeat
    this.detector = new QrsDetector(fs)
    this.qrsSearchSamples = Math.round(QrsDetector.QRS_SEARCH_S * fs)
    // R is at most qrsSearchSamples before the peak, P at most P_MAX_BEFORE_R_S before R, T at most
    // T_MAX_AFTER_R_S after R (and R is never after the peak): the scratch window holds all of them.
    this.lookBackSamples = this.qrsSearchSamples + Math.round(P_MAX_BEFORE_R_S * fs)
    this.waitSamples = Math.round(T_MAX_AFTER_R_S * fs)
    this.scratch = new Float32Array(this.lookBackSamples + this.waitSamples + 1)
  }

  /** Call with every ECG block, after it was pushed to the ring buffer. */
  push(block: SampleBlock): void {
    this.detector.process(block.firstSampleIndex, block.samples, this.handleQrs)
    this.locatePendingBeats()
  }

  // Created once (not per block), so process() gets the same function every time.
  private readonly handleQrs = (peakIndex: number): void => {
    this.pendingPeaks.push(peakIndex)
  }

  private locatePendingBeats(): void {
    while (this.pendingPeaks.length > 0) {
      const peakIndex = this.pendingPeaks[0]
      if (this.buffer.endIndex <= peakIndex + this.waitSamples) return // T not received yet
      this.pendingPeaks.shift()

      const rrSamples = peakIndex - this.previousPeakIndex
      const rrS = rrSamples <= MAX_RR_S * this.fs ? rrSamples / this.fs : DEFAULT_RR_S
      this.previousPeakIndex = peakIndex

      const firstIndex = peakIndex - this.lookBackSamples
      this.buffer.copyRange(firstIndex, this.scratch) // samples too old for the buffer become NaN
      const beat = findPqrst(
        this.scratch,
        firstIndex,
        this.fs,
        peakIndex - this.qrsSearchSamples,
        peakIndex,
        rrS,
      )
      if (beat === null) continue
      // Two detections close together (e.g. an artifact) may find the same R peak: keep it once.
      const last = this.beats.at(-1)
      if (last !== undefined && beat.r.sampleIndex <= last.r.sampleIndex) continue
      this.beats.push(beat)
      if (this.beats.length > MAX_BEATS) this.beats.shift()
      this.onBeat?.(beat)
    }
  }
}
