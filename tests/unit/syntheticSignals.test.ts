import { describe, expect, it } from 'vitest'
import {
  createGaussianNoise,
  ecgAt,
  rPeakTimeS,
  scgAt,
} from '../../src/sources/syntheticSignals.ts'

// Index of the largest sample of `signalAt` sampled at fs in [fromS, toS].
function argmaxSampleIndex(
  signalAt: (t: number) => number,
  fs: number,
  fromS: number,
  toS: number,
): number {
  let best = -1
  let bestValue = -Infinity
  for (let i = Math.ceil(fromS * fs); i <= Math.floor(toS * fs); i++) {
    const value = signalAt(i / fs)
    if (value > bestValue) {
      bestValue = value
      best = i
    }
  }
  return best
}

describe('synthetic signals', () => {
  it('places the R peaks at 0.3 s + k × 60 / HR', () => {
    expect(rPeakTimeS(0, 72)).toBeCloseTo(0.3, 12)
    expect(rPeakTimeS(3, 60)).toBeCloseTo(3.3, 12)
  })

  it.each([
    { heartRateBpm: 72, fs: 3000 },
    { heartRateBpm: 90, fs: 500 },
  ])('the sampled ECG maximum is the sample nearest to R ($heartRateBpm bpm, $fs Hz)', (c) => {
    for (let beat = 0; beat < 5; beat++) {
      const r = rPeakTimeS(beat, c.heartRateBpm)
      const peak = argmaxSampleIndex((t) => ecgAt(t, c.heartRateBpm), c.fs, r - 0.1, r + 0.1)
      expect(Math.abs(peak - r * c.fs)).toBeLessThanOrEqual(0.5)
    }
  })

  it.each([
    { heartRateBpm: 72, rToAoS: 0.08, fs: 3000 },
    { heartRateBpm: 60, rToAoS: 0.1, fs: 1000 },
    { heartRateBpm: 120, rToAoS: 0, fs: 250 },
  ])('the sampled SCG maximum is the sample nearest to R + delay ($rToAoS s, $fs Hz)', (c) => {
    for (let beat = 0; beat < 5; beat++) {
      const ao = rPeakTimeS(beat, c.heartRateBpm) + c.rToAoS
      const peak = argmaxSampleIndex(
        (t) => scgAt(t, c.heartRateBpm, c.rToAoS),
        c.fs,
        ao - 0.1,
        ao + 0.1,
      )
      expect(Math.abs(peak - ao * c.fs)).toBeLessThanOrEqual(0.5)
    }
  })

  it('has the expected amplitudes: R ≈ 1.2 mV, AO = 50 mV, flat before the first beat', () => {
    expect(ecgAt(rPeakTimeS(2, 72), 72)).toBeCloseTo(0.0012, 5)
    expect(scgAt(rPeakTimeS(2, 72) + 0.08, 72, 0.08)).toBeCloseTo(0.05, 6)
    expect(Math.abs(ecgAt(0, 72))).toBeLessThan(1e-7)
    expect(Math.abs(scgAt(0, 72, 0.08))).toBeLessThan(1e-7)
  })

  it('noise is reproducible for a seed, different for another seed, with the requested RMS', () => {
    const a = createGaussianNoise(1, 0.001)
    const b = createGaussianNoise(1, 0.001)
    const c = createGaussianNoise(2, 0.001)
    const first = Array.from({ length: 10_000 }, () => a())
    expect(Array.from({ length: 10_000 }, () => b())).toEqual(first)
    expect(c()).not.toBe(first[0])

    const rms = Math.sqrt(first.reduce((sum, v) => sum + v * v, 0) / first.length)
    expect(rms).toBeGreaterThan(0.00095)
    expect(rms).toBeLessThan(0.00105)
  })
})
