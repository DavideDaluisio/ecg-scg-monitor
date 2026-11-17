// Finds the P, Q, R, S and T peaks of one heartbeat in the raw ECG, as pure functions (no state, no DOM).
// Each wave is the highest or lowest sample of a time window placed relative to the R peak. The extreme must stand
// out from both ends of its window by more than a small fraction of the R height: otherwise the window only holds a
// slope or noise, and the wave is left out (null). Better no symbol than a wrong one.

/**
 * One detected wave (P, Q, R, S, T on the ECG, AO on the SCG): the exact sample and its raw value (volts), so the
 * plot can put a dot on the trace.
 */
export interface WavePoint {
  sampleIndex: number
  valueV: number
}

/** The waves of one heartbeat. R is always found; the others are null when they have no clear peak. */
export interface PqrstBeat {
  p: WavePoint | null
  q: WavePoint | null
  r: WavePoint
  s: WavePoint | null
  t: WavePoint | null
}

// Windows relative to R (seconds). Q and S sit right next to R; the PR interval is ~0.12–0.20 s and the T peak
// comes ~0.2–0.35 s after R. P and T windows shrink with the R–R interval, so they stay inside the beat at high
// heart rates.
const Q_S_SEARCH_S = 0.06
export const P_MAX_BEFORE_R_S = 0.3
const P_MIN_BEFORE_R_S = 0.08
const P_RR_FRACTION = 0.45
const T_MIN_AFTER_R_S = 0.1
export const T_MAX_AFTER_R_S = 0.45
const T_RR_FRACTION = 0.55
// P, Q, S and T must stand out from the ends of their window by more than 3 % of the R height (R minus the lower
// end of the R window): a few-microvolt ripple is not a wave.
const MIN_PROMINENCE_OF_R = 0.03

/**
 * Finds the waves of the beat whose R peak lies in [rSearchStart, rSearchEnd] (sample indices, inclusive).
 * `samples` are the raw values (volts) from sample index `firstIndex` on; `rrS` is the recent R–R interval (s).
 * Returns null when there is no R peak (window outside `samples`, missing data or no peak inside the window).
 */
export function findPqrst(
  samples: Float32Array,
  firstIndex: number,
  fs: number,
  rSearchStart: number,
  rSearchEnd: number,
  rrS: number,
): PqrstBeat | null {
  // PLACEHOLDER(Q10): the R peak is assumed positive (upward), as on the lab recordings checked so far.
  const r = findExtreme(samples, firstIndex, rSearchStart, rSearchEnd, 'max', 0)
  if (r === null) return null
  const rIndex = r.sampleIndex
  const rLowerEnd = Math.min(samples[rSearchStart - firstIndex], samples[rSearchEnd - firstIndex])
  const minProminence = MIN_PROMINENCE_OF_R * (r.valueV - rLowerEnd)

  const qsSamples = Math.round(Q_S_SEARCH_S * fs)
  const pStart = rIndex - Math.round(Math.min(P_MAX_BEFORE_R_S, P_RR_FRACTION * rrS) * fs)
  const pEnd = rIndex - Math.round(P_MIN_BEFORE_R_S * fs)
  const tStart = rIndex + Math.round(T_MIN_AFTER_R_S * fs)
  const tEnd = rIndex + Math.round(Math.min(T_MAX_AFTER_R_S, T_RR_FRACTION * rrS) * fs)
  return {
    p: findExtreme(samples, firstIndex, pStart, pEnd, 'max', minProminence),
    q: findExtreme(samples, firstIndex, rIndex - qsSamples, rIndex - 1, 'min', minProminence),
    r,
    s: findExtreme(samples, firstIndex, rIndex + 1, rIndex + qsSamples, 'min', minProminence),
    t: findExtreme(samples, firstIndex, tStart, tEnd, 'max', minProminence),
  }
}

/**
 * Highest ('max') or lowest ('min') sample in [from, to] (sample indices, inclusive), if it stands out from both
 * ends of the window by more than `minProminence` (volts). Returns null when the window has fewer than 3 samples, is
 * not entirely inside `samples` or contains a NaN (missing data), and when the extreme does not stand out: an
 * extreme on an end of the window (the signal only rises or falls there) never does. On a tie the first sample wins.
 */
export function findExtreme(
  samples: Float32Array,
  firstIndex: number,
  from: number,
  to: number,
  kind: 'max' | 'min',
  minProminence: number,
): WavePoint | null {
  const start = from - firstIndex
  const end = to - firstIndex
  if (start < 0 || end >= samples.length || end - start < 2) return null

  let best = start
  for (let i = start; i <= end; i++) {
    const value = samples[i]
    if (Number.isNaN(value)) return null
    if (kind === 'max' ? value > samples[best] : value < samples[best]) best = i
  }
  const prominence =
    kind === 'max'
      ? samples[best] - Math.max(samples[start], samples[end])
      : Math.min(samples[start], samples[end]) - samples[best]
  if (!(prominence > minProminence)) return null
  return { sampleIndex: firstIndex + best, valueV: samples[best] }
}
