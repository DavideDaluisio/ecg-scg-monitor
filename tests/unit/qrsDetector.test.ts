// The QRS detector on synthetic ECGs (src/sources/syntheticSignals.ts), whose R peaks are known exactly.
import { describe, expect, it } from 'vitest'
import { QrsDetector } from '../../src/analysis/qrsDetector.ts'
import { createGaussianNoise, ecgAt, rPeakTimeS } from '../../src/sources/syntheticSignals.ts'

const LEARNING_S = 2 // as in qrsDetector.ts

interface SignalOptions {
  heartRateBpm: number
  fs: number
  seconds: number
  offsetV?: number // constant added to every sample (the lab's raw ECG sits at ≈ 1.6 V)
  wanderV?: number // amplitude of a slow 0.3 Hz baseline wander
  noiseRmsV?: number
}

function syntheticEcg(options: SignalOptions): Float32Array {
  const { heartRateBpm, fs, seconds, offsetV = 0, wanderV = 0, noiseRmsV = 0 } = options
  const noise = createGaussianNoise(7, noiseRmsV)
  const samples = new Float32Array(Math.round(seconds * fs))
  for (let i = 0; i < samples.length; i++) {
    const t = i / fs
    samples[i] =
      ecgAt(t, heartRateBpm) + offsetV + wanderV * Math.sin(2 * Math.PI * 0.3 * t) + noise()
  }
  return samples
}

// Feeds `samples` in 20-ms blocks (like the sources) and returns the detected peaks, in seconds.
function detect(samples: Float32Array, fs: number, firstSampleIndex = 0): number[] {
  const detector = new QrsDetector(fs)
  const peaks: number[] = []
  const onQrs = (index: number) => peaks.push(index / fs)
  const blockLength = Math.max(1, Math.round(0.02 * fs))
  for (let start = 0; start < samples.length; start += blockLength) {
    detector.process(firstSampleIndex + start, samples.slice(start, start + blockLength), onQrs)
  }
  return peaks
}

// R peak times of the beats in [fromS, toS].
function rPeaksBetween(heartRateBpm: number, fromS: number, toS: number): number[] {
  const peaks: number[] = []
  for (let beat = 0; rPeakTimeS(beat, heartRateBpm) <= toS; beat++) {
    const t = rPeakTimeS(beat, heartRateBpm)
    if (t >= fromS) peaks.push(t)
  }
  return peaks
}

// Every detection lies just after one R peak (within the search window), and every R peak from `fromS` on (after
// the learning phase, and far enough from the end to be confirmed) has exactly one detection.
function expectOneDetectionPerBeat(
  peaks: number[],
  heartRateBpm: number,
  seconds: number,
  fromS = LEARNING_S + 0.3,
): void {
  const allR = rPeaksBetween(heartRateBpm, 0, seconds)
  const matched = new Set<number>()
  for (const peak of peaks) {
    const r = allR.filter((t) => t <= peak).at(-1)
    expect(r).toBeDefined()
    expect(peak - r!).toBeLessThanOrEqual(QrsDetector.QRS_SEARCH_S)
    expect(matched.has(r!)).toBe(false) // no beat detected twice
    matched.add(r!)
  }
  for (const r of rPeaksBetween(heartRateBpm, fromS, seconds - 0.5)) {
    expect(matched.has(r)).toBe(true)
  }
}

describe('QrsDetector', () => {
  it.each([
    { heartRateBpm: 60, fs: 3000 },
    { heartRateBpm: 72, fs: 3000 },
    { heartRateBpm: 100, fs: 500 },
    { heartRateBpm: 72, fs: 250 },
    { heartRateBpm: 150, fs: 1000 },
  ])('finds every beat once: $heartRateBpm bpm at $fs Hz', ({ heartRateBpm, fs }) => {
    const seconds = 20
    const peaks = detect(syntheticEcg({ heartRateBpm, fs, seconds }), fs)
    expectOneDetectionPerBeat(peaks, heartRateBpm, seconds)
  })

  it('learns for 2 s before the first detection', () => {
    const peaks = detect(syntheticEcg({ heartRateBpm: 72, fs: 3000, seconds: 10 }), 3000)
    expect(peaks[0]).toBeGreaterThanOrEqual(LEARNING_S)
  })

  it('ignores a DC offset, a baseline wander and noise', () => {
    const fs = 3000
    const seconds = 20
    const samples = syntheticEcg({
      heartRateBpm: 72,
      fs,
      seconds,
      offsetV: 1.6,
      wanderV: 0.0005, // ±0.5 mV, almost half the R peak
      noiseRmsV: 30e-6,
    })
    expectOneDetectionPerBeat(detect(samples, fs), 72, seconds)
  })

  it('finds nothing on a flat line, at 0 V or on a DC offset', () => {
    expect(detect(new Float32Array(10 * 3000), 3000)).toEqual([])
    expect(detect(new Float32Array(10 * 3000).fill(1.6), 3000)).toEqual([])
  })

  it('starts detecting when the ECG starts after a flat line', () => {
    const fs = 1000
    const flat = new Float32Array(5 * fs)
    const ecg = syntheticEcg({ heartRateBpm: 72, fs, seconds: 15 })
    const samples = new Float32Array(flat.length + ecg.length)
    samples.set(ecg, flat.length)
    const peaks = detect(samples, fs).map((t) => t - 5) // seconds since the ECG started
    expect(peaks.length).toBeGreaterThan(0)
    expectOneDetectionPerBeat(peaks, 72, 15)
  })

  it('recovers after a large artifact', () => {
    const fs = 1000
    const seconds = 40
    const samples = syntheticEcg({ heartRateBpm: 72, fs, seconds })
    // 0.5 s of a 100× larger 8 Hz oscillation at 10 s, like the movement artifacts of the lab files.
    for (let i = 10 * fs; i < 10.5 * fs; i++)
      samples[i] += 0.1 * Math.sin((2 * Math.PI * 8 * i) / fs)
    const peaks = detect(samples, fs)
    const after = peaks.filter((t) => t > 25)
    const expected = rPeaksBetween(72, 25.2, seconds - 0.5)
    expect(after.length).toBeGreaterThanOrEqual(expected.length)
    expectOneDetectionPerBeat(after, 72, seconds, 25.2)
  })

  it('restarts (new learning phase) after a gap in the sample indices', () => {
    const fs = 1000
    const detector = new QrsDetector(fs)
    const peaks: number[] = []
    const onQrs = (index: number) => peaks.push(index / fs)
    const samples = syntheticEcg({ heartRateBpm: 72, fs, seconds: 30 })
    // 0–10 s, then a 1-s gap (lost data), then 11–30 s.
    detector.process(0, samples.slice(0, 10 * fs), onQrs)
    detector.process(11 * fs, samples.slice(11 * fs), onQrs)
    const afterGap = peaks.filter((t) => t >= 10)
    expect(afterGap[0]).toBeGreaterThanOrEqual(11 + LEARNING_S)
    expectOneDetectionPerBeat(afterGap, 72, 30, 11 + LEARNING_S + 0.3)
  })

  it('restarts after a NaN sample', () => {
    const fs = 1000
    const samples = syntheticEcg({ heartRateBpm: 72, fs, seconds: 20 })
    samples[8 * fs] = NaN
    const peaks = detect(samples, fs)
    expect(peaks.some((t) => t > 8 && t < 8 + LEARNING_S)).toBe(false)
    expect(peaks.filter((t) => t > 8 + LEARNING_S).length).toBeGreaterThan(5)
  })

  it('skips samples it has already processed (overlapping block)', () => {
    const fs = 1000
    const samples = syntheticEcg({ heartRateBpm: 72, fs, seconds: 10 })
    const detector = new QrsDetector(fs)
    const peaks: number[] = []
    const onQrs = (index: number) => peaks.push(index)
    detector.process(0, samples.slice(0, 6 * fs), onQrs)
    detector.process(5 * fs, samples.slice(5 * fs), onQrs) // 1 s already seen
    expect(peaks).toEqual(detect(samples, fs).map((t) => Math.round(t * fs)))
  })
})
