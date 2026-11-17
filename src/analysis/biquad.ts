// Second-order IIR filter ("biquad"), with the coefficients of the Audio EQ Cookbook (R. Bristow-Johnson).
// Used only inside the QRS detector: the signal that is shown, recorded and exported is never filtered.

export type BiquadKind = 'lowpass' | 'highpass'

// Q of a 2nd-order Butterworth filter: the flattest pass band, no overshoot bump at the cut-off.
const BUTTERWORTH_Q = Math.SQRT1_2

export class Biquad {
  // Coefficients, already divided by a0.
  private readonly b0: number
  private readonly b1: number
  private readonly b2: number
  private readonly a1: number
  private readonly a2: number
  private readonly dcGain: number // output / input for a constant input: 1 for low-pass, 0 for high-pass

  // The last two inputs and outputs.
  private x1 = 0
  private x2 = 0
  private y1 = 0
  private y2 = 0

  constructor(kind: BiquadKind, cutoffHz: number, fs: number) {
    if (!(cutoffHz > 0 && cutoffHz < fs / 2)) {
      throw new Error(`Biquad cut-off must be between 0 and fs/2 (${fs / 2} Hz), got ${cutoffHz}`)
    }
    const w0 = (2 * Math.PI * cutoffHz) / fs
    const cos = Math.cos(w0)
    const alpha = Math.sin(w0) / (2 * BUTTERWORTH_Q)
    const a0 = 1 + alpha
    if (kind === 'lowpass') {
      this.b0 = (1 - cos) / 2 / a0
      this.b1 = (1 - cos) / a0
      this.b2 = (1 - cos) / 2 / a0
      this.dcGain = 1
    } else {
      this.b0 = (1 + cos) / 2 / a0
      this.b1 = -(1 + cos) / a0
      this.b2 = (1 + cos) / 2 / a0
      this.dcGain = 0
    }
    this.a1 = (-2 * cos) / a0
    this.a2 = (1 - alpha) / a0
  }

  /** Filters one sample. No allocation: safe to call for every sample. */
  process(x: number): number {
    const y =
      this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2
    this.x2 = this.x1
    this.x1 = x
    this.y2 = this.y1
    this.y1 = y
    return y
  }

  /**
   * Restarts the filter as if its input had always been `value`. Starting from the first sample (instead of 0)
   * avoids a huge start-up transient on the lab files, whose raw ECG sits on a DC offset of about 1.6 V.
   */
  reset(value: number): void {
    this.x1 = value
    this.x2 = value
    this.y1 = value * this.dcGain
    this.y2 = value * this.dcGain
  }
}
