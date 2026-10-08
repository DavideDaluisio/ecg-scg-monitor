// Synthetic ECG and SCG with a known timing, used to check that the two panels stay aligned (M3).
// Beat k has its ECG R peak at FIRST_R_S + k × 60 / heartRate. The SCG aortic-opening (AO) peak comes exactly
// rToAoS later, so the R→AO delay read on the plot can be compared with the configured one.
// Values are in volts. Pure functions: no state, no allocations.

export const FIRST_R_S = 0.3 // the first beat starts after a short flat line, like the demo files

// Sum of Gaussian bumps: a simple PQRST shape, the same as scripts/make-fixtures.mjs (amplitudes in volts).
const PQRST = [
  { offsetS: -0.2, amplitudeV: 0.00015, widthS: 0.025 }, // P
  { offsetS: -0.03, amplitudeV: -0.0001, widthS: 0.008 }, // Q
  { offsetS: 0, amplitudeV: 0.0012, widthS: 0.01 }, // R
  { offsetS: 0.03, amplitudeV: -0.0003, widthS: 0.009 }, // S
  { offsetS: 0.25, amplitudeV: 0.0003, widthS: 0.05 }, // T
]
// A beat's ECG is (almost) zero outside [R − 0.35 s, R + 0.5 s]: P and T are more than 5 widths away.
const ECG_BEFORE_R_S = 0.35
const ECG_AFTER_R_S = 0.5

// SCG: one short 30 Hz vibration at aortic opening (AO) and a smaller one at aortic closing (AC).
// Unlike the demo files (whose burst *starts* 80 ms after R), the burst is centered on its instant:
// its highest peak is exactly at AO, which is the point read on the plot.
const AO_AMPLITUDE_V = 0.05
const AC_AMPLITUDE_V = 0.02
const AO_TO_AC_S = 0.3 // fixed for simplicity (in reality it shortens at high heart rates)
const BURST_WIDTH_S = 0.012 // width of the Gaussian envelope
const BURST_FREQUENCY_HZ = 30
const BURST_HALF_LENGTH_S = 5 * BURST_WIDTH_S // the envelope is ~0 beyond 5 widths

function gaussian(x: number, width: number): number {
  return Math.exp(-0.5 * (x / width) ** 2)
}

/** Time (s) of the R peak of beat `beat` (0, 1, 2…). */
export function rPeakTimeS(beat: number, heartRateBpm: number): number {
  return FIRST_R_S + (beat * 60) / heartRateBpm
}

/** ECG value (V) at time t (s). Baseline 0 V, R peak ≈ 1.2 mV. */
export function ecgAt(t: number, heartRateBpm: number): number {
  const beatS = 60 / heartRateBpm
  // Only the beats whose R peak is in [t − ECG_AFTER_R_S, t + ECG_BEFORE_R_S] contribute.
  const firstBeat = Math.max(0, Math.ceil((t - ECG_AFTER_R_S - FIRST_R_S) / beatS))
  const lastBeat = Math.floor((t + ECG_BEFORE_R_S - FIRST_R_S) / beatS)
  let value = 0
  for (let beat = firstBeat; beat <= lastBeat; beat++) {
    const sinceR = t - rPeakTimeS(beat, heartRateBpm)
    for (const wave of PQRST)
      value += wave.amplitudeV * gaussian(sinceR - wave.offsetS, wave.widthS)
  }
  return value
}

/** SCG value (V) at time t (s). The AO peak (50 mV) is at R + rToAoS, the AC peak (20 mV) 0.3 s later. */
export function scgAt(t: number, heartRateBpm: number, rToAoS: number): number {
  const beatS = 60 / heartRateBpm
  // Relative to its R peak, a beat's SCG lasts from AO − BURST_HALF_LENGTH_S to AC + BURST_HALF_LENGTH_S.
  const fromS = rToAoS - BURST_HALF_LENGTH_S
  const toS = rToAoS + AO_TO_AC_S + BURST_HALF_LENGTH_S
  const firstBeat = Math.max(0, Math.ceil((t - toS - FIRST_R_S) / beatS))
  const lastBeat = Math.floor((t - fromS - FIRST_R_S) / beatS)
  let value = 0
  for (let beat = firstBeat; beat <= lastBeat; beat++) {
    const aoS = rPeakTimeS(beat, heartRateBpm) + rToAoS
    value += burst(t - aoS, AO_AMPLITUDE_V) + burst(t - aoS - AO_TO_AC_S, AC_AMPLITUDE_V)
  }
  return value
}

// A cosine under a Gaussian envelope: both are highest at sinceCenter = 0, so the peak is exactly the center.
function burst(sinceCenter: number, amplitudeV: number): number {
  return (
    amplitudeV *
    gaussian(sinceCenter, BURST_WIDTH_S) *
    Math.cos(2 * Math.PI * BURST_FREQUENCY_HZ * sinceCenter)
  )
}

/**
 * Returns a function that gives Gaussian noise with the given RMS (volts) on every call.
 * Seeded: the same seed always gives the same sequence, so a synthetic session can be reproduced exactly.
 */
export function createGaussianNoise(seed: number, rmsV: number): () => number {
  let state = seed >>> 0
  // mulberry32: a tiny, well-known pseudo-random generator, uniform in [0, 1).
  function uniform(): number {
    state = (state + 0x6d2b79f5) >>> 0
    let z = state
    z = Math.imul(z ^ (z >>> 15), z | 1)
    z ^= z + Math.imul(z ^ (z >>> 7), z | 61)
    return ((z ^ (z >>> 14)) >>> 0) / 4294967296
  }
  // Box–Muller: two uniform numbers give one normally distributed number.
  return () => {
    const u1 = 1 - uniform() // in (0, 1], so the logarithm is finite
    const u2 = uniform()
    return rmsV * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
  }
}
