// Live AO detection on the SCG channel of a session (display only: nothing is recorded or exported).
// Only used when the session's ECG and SCG were recorded at the same time: each ECG R peak (from the PqrstTracker)
// gives the start of a beat on the SCG. Once the SCG ring buffer holds the samples up to the end of that beat's AO
// window, findAo locates the AO on the raw SCG. The R peaks arrive ~0.6 s after they happen, so the AO symbols
// appear at about the same time as the PQRST symbols.
import type { RingBuffer } from '../core/ringBuffer.ts'
import { AO_MAX_AFTER_R_S, AO_REFERENCE_S, findAo } from './aoPoint.ts'
import type { WavePoint } from './pqrstPoints.ts'

// Same R–R rules as PqrstTracker: default for the first beat or after a pause, points kept for the plot.
const DEFAULT_RR_S = 0.8
const MAX_RR_S = 2
const MAX_POINTS = 300

// An R peak waiting for the SCG samples of its AO window.
interface PendingR {
  rIndex: number // SCG sample index
  rrS: number
}

export class AoTracker {
  /** Detected AO peaks (SCG sample indices), oldest first. The plot keeps a reference and reads it every redraw. */
  readonly points: WavePoint[] = []

  private readonly buffer: RingBuffer
  private readonly scgFs: number
  private readonly ecgFs: number
  private readonly windowEndSamples: number // from R to the latest possible end of the AO window
  private readonly referenceSamples: number // the second before the end of the window (see findAo)
  // The raw SCG of one beat, from AO_REFERENCE_S before the latest end of the window to that end (it holds the
  // whole AO window too). Reused for every beat.
  private readonly scratch: Float32Array
  private readonly pending: PendingR[] = []
  private previousRIndex = -Infinity

  constructor(scgBuffer: RingBuffer, scgFs: number, ecgFs: number) {
    this.buffer = scgBuffer
    this.scgFs = scgFs
    this.ecgFs = ecgFs
    this.windowEndSamples = Math.round(AO_MAX_AFTER_R_S * scgFs)
    this.referenceSamples = Math.round(AO_REFERENCE_S * scgFs)
    this.scratch = new Float32Array(this.referenceSamples + 1)
  }

  /** Call with each R peak found on the ECG (ECG sample index), oldest first. */
  addRPeak(rEcgIndex: number): void {
    // Sample index 0 of every channel is the same instant, so the same time in seconds is the same instant.
    const rIndex = Math.round((rEcgIndex / this.ecgFs) * this.scgFs)
    const rrSamples = rIndex - this.previousRIndex
    const rrS = rrSamples <= MAX_RR_S * this.scgFs ? rrSamples / this.scgFs : DEFAULT_RR_S
    this.previousRIndex = rIndex
    this.pending.push({ rIndex, rrS })
  }

  /**
   * Call after every block of the session (ECG or SCG), once it was pushed to its ring buffer: locates the AO of
   * every pending R whose window the SCG buffer now holds. Works whichever channel's blocks arrive first.
   */
  update(): void {
    while (this.pending.length > 0) {
      const { rIndex, rrS } = this.pending[0]
      if (this.buffer.endIndex <= rIndex + this.windowEndSamples) return // SCG not received yet
      this.pending.shift()

      // Samples too old for the buffer, or before the start of the session, become NaN.
      const firstIndex = rIndex + this.windowEndSamples - this.referenceSamples
      this.buffer.copyRange(firstIndex, this.scratch)
      const ao = findAo(this.scratch, firstIndex, this.scgFs, rIndex, rrS)
      if (ao === null) continue
      // Two R peaks close together (e.g. an artifact) may find the same AO: keep it once.
      const last = this.points.at(-1)
      if (last !== undefined && ao.sampleIndex <= last.sampleIndex) continue
      this.points.push(ao)
      if (this.points.length > MAX_POINTS) this.points.shift()
    }
  }
}
