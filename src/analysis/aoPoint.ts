// Finds the aortic-opening (AO) peak of one heartbeat in the raw SCG, as a pure function (no state, no DOM).
// Like the paper's pipeline (Bhattacharya et al. 2023), the ECG R peak marks the start of each beat: the AO is the
// first major peak of the SCG after it, i.e. the highest sample of a window placed after R. The window ends before
// the aortic closing (AC), so AC is never taken for AO. Better no symbol than a wrong one: the AO is left out (null)
// when its window has missing data, or when the highest sample does not stand out clearly (see below).
import { findExtreme, type WavePoint } from './pqrstPoints.ts'

// Window after R (seconds). The R→AO delay (≈ the pre-ejection period) is ~60–200 ms; on the lab recording
// `ecg_scg_subject02` (≈ 100 bpm) it is 100–160 ms. The window shrinks with the R–R interval, so at high heart rates
// (shorter ejection) it still ends before AC.
export const AO_MIN_AFTER_R_S = 0.04
export const AO_MAX_AFTER_R_S = 0.25
const AO_RR_FRACTION = 0.45
// The AO must stand out from both ends of its window by more than 10 % of the SCG's peak-to-peak range over the
// second that ends with the window (it holds the previous beat's AO and AC). Otherwise the window holds only a
// slope (the real AO is outside it) or small bumps next to a movement artifact. On `ecg_scg_subject02` this leaves
// out ~10 % of the beats, almost all next to an artifact and with an AO far from the usual delay.
export const AO_REFERENCE_S = 1
const MIN_PROMINENCE_OF_RANGE = 0.1

/**
 * Finds the AO of the beat whose R peak is at SCG sample index `rIndex` (the R of the ECG converted to the SCG's
 * sample rate). `samples` are the raw SCG values (volts) from sample index `firstIndex` on; they should start
 * AO_REFERENCE_S before the end of the window (a shorter history only makes the reference range smaller).
 * `rrS` is the recent R–R interval (s). Returns null when the window is not entirely inside `samples`, contains a
 * NaN, or has no peak that stands out.
 */
export function findAo(
  samples: Float32Array,
  firstIndex: number,
  fs: number,
  rIndex: number,
  rrS: number,
): WavePoint | null {
  const from = rIndex + Math.round(AO_MIN_AFTER_R_S * fs)
  const to = rIndex + Math.round(Math.min(AO_MAX_AFTER_R_S, AO_RR_FRACTION * rrS) * fs)
  const range = peakToPeak(samples, firstIndex, to - Math.round(AO_REFERENCE_S * fs), to)
  // PLACEHOLDER(Q11): AO is assumed to be a positive (upward) peak, as on the synthetic signals and the lab recording
  // checked so far.
  return findExtreme(samples, firstIndex, from, to, 'max', MIN_PROMINENCE_OF_RANGE * range)
}

/**
 * Highest minus lowest sample in [from, to] (sample indices, inclusive), limited to the part inside `samples` and
 * skipping missing samples (NaN). 0 when there is no valid sample.
 */
export function peakToPeak(
  samples: Float32Array,
  firstIndex: number,
  from: number,
  to: number,
): number {
  const start = Math.max(0, from - firstIndex)
  const end = Math.min(samples.length - 1, to - firstIndex)
  let min = Infinity
  let max = -Infinity
  for (let i = start; i <= end; i++) {
    const value = samples[i]
    if (value < min) min = value // false for NaN: missing samples are skipped
    if (value > max) max = value
  }
  return max >= min ? max - min : 0
}
