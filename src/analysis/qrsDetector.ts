// Real-time QRS detector: a simplified Pan–Tompkins (Pan & Tompkins, IEEE Trans. Biomed. Eng., 1985).
// It works sample by sample on the blocks of the ECG channel and reports, for each heartbeat, the sample where its
// "QRS energy" peaks. The R peak lies in the QRS_SEARCH_S seconds before that sample (see pqrstTracker.ts).
// The filters below live only in this detector: the ECG on screen and in the recordings stays raw.
import { Biquad } from './biquad.ts'

// 5–15 Hz keeps most of the QRS energy and removes the baseline wander and the slower P and T waves.
const HIGH_PASS_HZ = 5
const LOW_PASS_HZ = 15
// Moving-window integration: about the width of a QRS complex.
const INTEGRATION_S = 0.15
// No new QRS within 200 ms of the previous one (the heart cannot beat faster than 300 bpm).
const REFRACTORY_S = 0.2
// The first 2 s only measure the signal level: no detection yet.
const LEARNING_S = 2
// A QRS starts when the integrated signal rises above this fraction of the level of the recent QRS peaks.
const THRESHOLD_FRACTION = 0.3
// Each new QRS peak moves the level by 1/8 (as in Pan–Tompkins). A peak counts at most 4 × the current level,
// so a movement artifact cannot push the threshold out of reach in one go.
const LEVEL_UPDATE = 0.125
const MAX_PEAK_OVER_LEVEL = 4
// No QRS for 3 s (e.g. after a large artifact): the level is halved, at most 5 times in a row (1/32).
// The limit keeps a lost or noisy signal from being marked as heartbeats.
const SEARCH_BACK_S = 3
const MAX_HALVINGS = 5
// T-wave check (Pan–Tompkins): a bump less than 360 ms after the previous QRS and less than half as strong is
// most likely the T wave of that beat, not a new QRS.
const T_WAVE_CHECK_S = 0.36
const T_WAVE_FRACTION = 0.5

/** Called with the sample index where the integrated QRS energy peaked. */
export type QrsCallback = (peakIndex: number) => void

export class QrsDetector {
  /** Seconds before the reported peak in which the R peak lies (integration window + filter delay). */
  static readonly QRS_SEARCH_S = INTEGRATION_S + 0.075

  private readonly fs: number
  private readonly highPass: Biquad
  private readonly lowPass: Biquad
  private readonly integrationSamples: number
  private readonly refractorySamples: number
  private readonly learningSamples: number
  private readonly searchBackSamples: number
  private readonly tWaveCheckSamples: number

  // Moving-window integration: the last squared slopes and their running sum.
  private readonly squaredSlopes: Float64Array
  private slopeSum = 0
  private slopeCount = 0 // number of samples since the reset (the window is full when ≥ integrationSamples)

  private nextIndex = -1 // index of the next expected sample, -1 before the first block
  private needsReset = true
  private learningEndIndex = 0
  private previousFiltered = 0

  private level = 0 // running level of the QRS peaks of the integrated signal (SPKI in Pan–Tompkins)
  private halvings = 0
  private lastEventIndex = 0 // last QRS or last halving
  private lastQrsIndex = -Infinity
  private lastQrsValue = 0 // top of the integrated signal at the last QRS

  // The bump of the integrated signal being followed (between the threshold crossing and its fall).
  private inPeak = false
  private peakValue = 0
  private peakIndex = 0

  constructor(fs: number) {
    this.fs = fs
    this.highPass = new Biquad('highpass', HIGH_PASS_HZ, fs)
    this.lowPass = new Biquad('lowpass', LOW_PASS_HZ, fs)
    this.integrationSamples = Math.max(1, Math.round(INTEGRATION_S * fs))
    this.refractorySamples = Math.round(REFRACTORY_S * fs)
    this.learningSamples = Math.round(LEARNING_S * fs)
    this.searchBackSamples = Math.round(SEARCH_BACK_S * fs)
    this.tWaveCheckSamples = Math.round(T_WAVE_CHECK_S * fs)
    this.squaredSlopes = new Float64Array(this.integrationSamples)
  }

  /**
   * Processes a block of raw samples (volts) that starts at `firstSampleIndex`, and calls `onQrs` for every QRS
   * found. A gap in the indices or a NaN sample (lost data) restarts the detector, learning phase included.
   * Samples already processed (overlap) are skipped. No allocation: `onQrs` should be created once by the caller.
   */
  process(firstSampleIndex: number, samples: Float32Array, onQrs: QrsCallback): void {
    if (this.nextIndex !== -1 && firstSampleIndex > this.nextIndex) this.needsReset = true
    const skip = this.nextIndex === -1 ? 0 : Math.max(0, this.nextIndex - firstSampleIndex)

    for (let i = skip; i < samples.length; i++) {
      const index = firstSampleIndex + i
      const value = samples[i]
      if (Number.isNaN(value)) {
        this.needsReset = true
        continue
      }
      if (this.needsReset) this.reset(index, value)
      // The array and position, not the value: processSample is too large for V8 to inline, and passing a
      // float to a real call boxes it into a new heap number on every sample.
      this.processSample(index, samples, i, onQrs)
    }
    this.nextIndex = Math.max(this.nextIndex, firstSampleIndex + samples.length)
  }

  // Starts again from scratch at `index`: filters primed on `value`, empty window, new learning phase.
  private reset(index: number, value: number): void {
    this.needsReset = false
    this.highPass.reset(value)
    this.lowPass.reset(0) // the high-pass output of a constant signal is 0
    this.previousFiltered = 0
    this.squaredSlopes.fill(0)
    this.slopeSum = 0
    this.slopeCount = 0
    this.learningEndIndex = index + this.learningSamples
    this.level = 0
    this.halvings = 0
    this.lastEventIndex = this.learningEndIndex
    this.lastQrsIndex = -Infinity
    this.lastQrsValue = 0
    this.inPeak = false
  }

  private processSample(
    index: number,
    samples: Float32Array,
    position: number,
    onQrs: QrsCallback,
  ): void {
    // 1. Band-pass 5–15 Hz, 2. slope (V/s), 3. squared (always positive, large slopes count much more).
    const filtered = this.lowPass.process(this.highPass.process(samples[position]))
    const slope = (filtered - this.previousFiltered) * this.fs
    this.previousFiltered = filtered
    const squared = slope * slope

    // 4. Moving-window integration: mean of the squared slopes of the last INTEGRATION_S seconds.
    const slot = this.slopeCount % this.integrationSamples
    this.slopeSum += squared - this.squaredSlopes[slot]
    if (this.slopeSum < 0) this.slopeSum = 0 // rounding errors of the running sum
    this.squaredSlopes[slot] = squared
    this.slopeCount++
    const integrated = this.slopeSum / this.integrationSamples

    // 5. Learning phase: the level starts at the largest value of the first seconds.
    if (index < this.learningEndIndex) {
      if (integrated > this.level) this.level = integrated
      return
    }
    if (this.level === 0) {
      // Only a flat line so far: learn for another LEARNING_S seconds.
      this.learningEndIndex = index + this.learningSamples
      this.lastEventIndex = this.learningEndIndex
      return
    }

    // 6. Follow each bump above the threshold up to its top; it is a QRS once it has fallen to half its top
    //    (or after one integration window without a new top).
    if (!this.inPeak) {
      const threshold = THRESHOLD_FRACTION * this.level
      if (integrated > threshold && index - this.lastQrsIndex > this.refractorySamples) {
        this.inPeak = true
        this.peakValue = integrated
        this.peakIndex = index
      }
    } else if (integrated > this.peakValue) {
      this.peakValue = integrated
      this.peakIndex = index
    } else if (
      integrated < this.peakValue / 2 ||
      index - this.peakIndex > this.integrationSamples
    ) {
      this.inPeak = false
      const isTWave =
        this.peakIndex - this.lastQrsIndex < this.tWaveCheckSamples &&
        this.peakValue < T_WAVE_FRACTION * this.lastQrsValue
      if (!isTWave) {
        this.lastQrsIndex = this.peakIndex
        this.lastQrsValue = this.peakValue
        const counted = Math.min(this.peakValue, MAX_PEAK_OVER_LEVEL * this.level)
        this.level += LEVEL_UPDATE * (counted - this.level)
        this.halvings = 0
        this.lastEventIndex = index
        onQrs(this.peakIndex)
      }
    }

    // 7. Search back: no QRS for a while, the threshold was probably raised by an artifact.
    if (
      !this.inPeak &&
      index - this.lastEventIndex > this.searchBackSamples &&
      this.halvings < MAX_HALVINGS
    ) {
      this.level /= 2
      this.halvings++
      this.lastEventIndex = index
    }
  }
}
