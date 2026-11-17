// findAo on the synthetic SCG (src/sources/syntheticSignals.ts): the AO burst of each beat has its highest peak
// exactly at R + rToAoS, and the AC burst comes 0.3 s later. So the AO must be found to the sample.
import { describe, expect, it } from 'vitest'
import { findAo, peakToPeak } from '../../src/analysis/aoPoint.ts'
import { createGaussianNoise, rPeakTimeS, scgAt } from '../../src/sources/syntheticSignals.ts'

const BEAT = 4 // a beat with previous beats, so the 1-s reference holds a whole cardiac cycle

// 2 s of synthetic SCG ending 0.5 s after the R peak of BEAT: the 1-s reference and the AO window are inside it.
function scgAroundR(heartRateBpm: number, rToAoS: number, fs: number, noiseRmsV = 0) {
  const rS = rPeakTimeS(BEAT, heartRateBpm)
  const firstIndex = Math.round((rS - 1.5) * fs)
  const samples = new Float32Array(Math.round(2 * fs))
  const noise = createGaussianNoise(7, noiseRmsV)
  for (let i = 0; i < samples.length; i++) {
    samples[i] = scgAt((firstIndex + i) / fs, heartRateBpm, rToAoS) + noise()
  }
  return { rS, rIndex: Math.round(rS * fs), firstIndex, samples }
}

describe('findAo', () => {
  it.each([
    { heartRateBpm: 72, rToAoS: 0.08, fs: 3000 },
    { heartRateBpm: 60, rToAoS: 0.06, fs: 1000 },
    { heartRateBpm: 60, rToAoS: 0.2, fs: 500 },
    { heartRateBpm: 100, rToAoS: 0.12, fs: 3000 },
    { heartRateBpm: 150, rToAoS: 0.1, fs: 250 },
    { heartRateBpm: 150, rToAoS: 0.15, fs: 3000 },
  ])(
    'finds the AO at R + $rToAoS s to the sample: $heartRateBpm bpm, $fs Hz',
    ({ heartRateBpm, rToAoS, fs }) => {
      const { rS, rIndex, firstIndex, samples } = scgAroundR(heartRateBpm, rToAoS, fs)
      const ao = findAo(samples, firstIndex, fs, rIndex, 60 / heartRateBpm)
      expect(ao).not.toBeNull()
      expect(Math.abs(ao!.sampleIndex / fs - (rS + rToAoS))).toBeLessThanOrEqual(1 / fs)
      // The value is the raw sample at that index (the dot sits on the trace), and the AO peak is positive.
      expect(ao!.valueV).toBe(samples[ao!.sampleIndex - firstIndex])
      expect(ao!.valueV).toBeGreaterThan(0)
    },
  )

  it('stays within 3 ms of the AO with the synthetic noise', () => {
    const fs = 3000
    const { rS, rIndex, firstIndex, samples } = scgAroundR(72, 0.08, fs, 0.5e-3) // SCG_NOISE_RMS_V
    const ao = findAo(samples, firstIndex, fs, rIndex, 60 / 72)
    expect(ao).not.toBeNull()
    expect(Math.abs(ao!.sampleIndex / fs - (rS + 0.08))).toBeLessThanOrEqual(0.003)
  })

  it('leaves out an AO that comes after the window (only the small lobe before its peak is inside)', () => {
    // 60 bpm: the window ends 250 ms after R. The AO peak is at 260 ms; its lobe at 227 ms is 2 % of its height.
    const fs = 1000
    const { rIndex, firstIndex, samples } = scgAroundR(60, 0.26, fs)
    expect(findAo(samples, firstIndex, fs, rIndex, 1)).toBeNull()
  })

  it('leaves out the AO next to a movement artifact (much larger than the beat)', () => {
    const fs = 1000
    const { rIndex, firstIndex, samples } = scgAroundR(72, 0.08, fs)
    expect(findAo(samples, firstIndex, fs, rIndex, 60 / 72)).not.toBeNull()
    samples[rIndex - Math.round(0.5 * fs) - firstIndex] = 1 // a 1-V spike 0.5 s before R; the AO is 50 mV
    expect(findAo(samples, firstIndex, fs, rIndex, 60 / 72)).toBeNull()
  })

  it('leaves out the AO when its window has a missing sample, is flat or is outside the samples', () => {
    const fs = 1000
    const { rIndex, firstIndex, samples } = scgAroundR(72, 0.08, fs)
    const withGap = samples.slice()
    withGap[rIndex + Math.round(0.06 * fs) - firstIndex] = NaN
    expect(findAo(withGap, firstIndex, fs, rIndex, 60 / 72)).toBeNull()

    expect(findAo(new Float32Array(2 * fs).fill(0.002), firstIndex, fs, rIndex, 60 / 72)).toBeNull()

    // The window ends after the last sample: the SCG of this beat has not arrived yet.
    const lastR = firstIndex + samples.length - Math.round(0.1 * fs)
    expect(findAo(samples, firstIndex, fs, lastR, 60 / 72)).toBeNull()
  })
})

describe('peakToPeak', () => {
  it('skips missing samples and the part of the range outside the samples', () => {
    const samples = Float32Array.from([NaN, 1, -2, 3, NaN])
    expect(peakToPeak(samples, 10, 5, 100)).toBe(5)
    expect(peakToPeak(samples, 10, 11, 12)).toBe(3)
  })

  it('is 0 when there is no valid sample', () => {
    expect(peakToPeak(Float32Array.from([NaN, NaN]), 0, 0, 1)).toBe(0)
    expect(peakToPeak(Float32Array.from([1, 2]), 0, 5, 9)).toBe(0)
  })
})
