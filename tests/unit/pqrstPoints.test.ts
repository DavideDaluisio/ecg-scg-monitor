// findPqrst on synthetic beats, whose waves are Gaussian bumps at known offsets from R
// (src/sources/syntheticSignals.ts: P −200 ms, Q −30 ms, R 0, S +30 ms, T +250 ms). Neighboring bumps shift the
// extremes of the sum by up to ~3 ms (Q is pulled earlier by the rising R), hence the 5-ms tolerance.
import { describe, expect, it } from 'vitest'
import { findExtreme, findPqrst, type WavePoint } from '../../src/analysis/pqrstPoints.ts'
import { ecgAt, rPeakTimeS } from '../../src/sources/syntheticSignals.ts'

const WAVE_OFFSETS_S = { p: -0.2, q: -0.03, r: 0, s: 0.03, t: 0.25 }
const TOLERANCE_S = 0.005

// 1.2 s of synthetic ECG centered on the R peak of `beat`.
function beatWindow(heartRateBpm: number, fs: number, beat: number) {
  const rS = rPeakTimeS(beat, heartRateBpm)
  const firstIndex = Math.round((rS - 0.6) * fs)
  const samples = new Float32Array(Math.round(1.2 * fs))
  for (let i = 0; i < samples.length; i++) samples[i] = ecgAt((firstIndex + i) / fs, heartRateBpm)
  return { rS, rIndex: Math.round(rS * fs), firstIndex, samples }
}

function timeS(point: WavePoint | null, fs: number): number {
  expect(point).not.toBeNull()
  return point!.sampleIndex / fs
}

describe('findPqrst', () => {
  it.each([
    { heartRateBpm: 72, fs: 3000 },
    { heartRateBpm: 60, fs: 1000 },
    { heartRateBpm: 100, fs: 500 },
  ])('finds P, Q, R, S, T at $heartRateBpm bpm, $fs Hz', ({ heartRateBpm, fs }) => {
    const { rS, rIndex, firstIndex, samples } = beatWindow(heartRateBpm, fs, 4)
    const searchHalf = Math.round(0.1 * fs)
    const beat = findPqrst(
      samples,
      firstIndex,
      fs,
      rIndex - searchHalf,
      rIndex + searchHalf,
      60 / heartRateBpm,
    )
    expect(beat).not.toBeNull()
    // R to the sample.
    expect(Math.abs(beat!.r.sampleIndex - rIndex)).toBeLessThanOrEqual(1)
    for (const wave of ['p', 'q', 's', 't'] as const) {
      expect(Math.abs(timeS(beat![wave], fs) - (rS + WAVE_OFFSETS_S[wave]))).toBeLessThanOrEqual(
        TOLERANCE_S,
      )
    }
    // The value is the raw sample at that index (the dot sits on the trace).
    expect(beat!.r.valueV).toBe(samples[beat!.r.sampleIndex - firstIndex])
    expect(beat!.p!.valueV).toBeGreaterThan(0)
    expect(beat!.q!.valueV).toBeLessThan(0)
    expect(beat!.s!.valueV).toBeLessThan(0)
  })

  it('leaves out a wave that has no peak in its window (no Q wave)', () => {
    const fs = 1000
    // A beat made of R and T only: before R the signal is flat, then rises, so its lowest point is the window edge.
    const samples = new Float32Array(fs)
    const rIndex = 500
    for (let i = 0; i < samples.length; i++) {
      const t = (i - rIndex) / fs
      samples[i] =
        0.001 * Math.exp(-0.5 * (t / 0.01) ** 2) +
        0.0003 * Math.exp(-0.5 * ((t - 0.25) / 0.05) ** 2)
    }
    const beat = findPqrst(samples, 0, fs, rIndex - 100, rIndex + 100, 0.8)
    expect(beat).not.toBeNull()
    expect(beat!.r.sampleIndex).toBe(rIndex)
    expect(beat!.q).toBeNull()
    expect(beat!.s).toBeNull()
    expect(beat!.p).toBeNull()
    expect(beat!.t!.sampleIndex).toBe(rIndex + 250)
  })

  it('ignores a tiny ripple (less than 3 % of the R height)', () => {
    const fs = 1000
    const samples = new Float32Array(fs)
    const rIndex = 500
    for (let i = 0; i < samples.length; i++) {
      const t = (i - rIndex) / fs
      // R of 1 mV, and a 10-µV bump where the P wave would be: 1 % of R.
      samples[i] =
        0.001 * Math.exp(-0.5 * (t / 0.01) ** 2) + 10e-6 * Math.exp(-0.5 * ((t + 0.2) / 0.025) ** 2)
    }
    const beat = findPqrst(samples, 0, fs, rIndex - 100, rIndex + 100, 0.8)
    expect(beat!.p).toBeNull()
  })

  it('returns null on a flat line (no R peak)', () => {
    expect(findPqrst(new Float32Array(3000), 0, 3000, 1000, 1600, 0.8)).toBeNull()
  })

  it('returns null when the R window is outside the samples', () => {
    const { firstIndex, samples } = beatWindow(72, 1000, 4)
    expect(findPqrst(samples, firstIndex, 1000, firstIndex - 50, firstIndex + 50, 0.8)).toBeNull()
  })

  it('leaves out a wave whose window contains missing data (NaN)', () => {
    const fs = 1000
    const { rS, rIndex, firstIndex, samples } = beatWindow(72, fs, 4)
    samples[Math.round((rS - 0.2) * fs) - firstIndex] = NaN // on the P peak
    const beat = findPqrst(samples, firstIndex, fs, rIndex - 100, rIndex + 100, 60 / 72)
    expect(beat!.p).toBeNull()
    expect(beat!.t).not.toBeNull()
  })

  it('shrinks the P and T windows at a short R–R interval', () => {
    const fs = 1000
    const { rIndex, firstIndex, samples } = beatWindow(72, fs, 4)
    // With R–R = 0.3 s the T window ends at R + 0.165 s, before the T peak (R + 0.25 s): no peak inside.
    const beat = findPqrst(samples, firstIndex, fs, rIndex - 100, rIndex + 100, 0.3)
    expect(beat!.t).toBeNull()
  })
})

describe('findExtreme', () => {
  const samples = Float32Array.from([0, 1, 3, 2, 5, 4, 0])

  it('returns the index and value of the highest or lowest sample', () => {
    expect(findExtreme(samples, 10, 10, 16, 'max', 0)).toEqual({ sampleIndex: 14, valueV: 5 })
    expect(findExtreme(samples, 10, 12, 14, 'min', 0)).toEqual({ sampleIndex: 13, valueV: 2 })
  })

  it('returns null when the extreme is on an end or the window is too short', () => {
    expect(findExtreme(samples, 10, 10, 12, 'max', 0)).toBeNull() // rising: highest at the right end
    expect(findExtreme(samples, 10, 12, 16, 'min', 0)).toBeNull() // lowest at the right end
    expect(findExtreme(samples, 10, 11, 12, 'min', 0)).toBeNull() // two samples: no inside point
    expect(findExtreme(samples, 10, 9, 14, 'max', 0)).toBeNull() // starts before the samples
  })

  it('needs the extreme to stand out from both ends by more than minProminence', () => {
    // [1, 3, 2, 5, 4]: the top (5) is 1 above the higher end (4).
    expect(findExtreme(samples, 10, 11, 15, 'max', 0.9)).toEqual({ sampleIndex: 14, valueV: 5 })
    expect(findExtreme(samples, 10, 11, 15, 'max', 1)).toBeNull()
  })

  it('returns null on a flat window', () => {
    expect(findExtreme(new Float32Array(10), 0, 0, 9, 'max', 0)).toBeNull()
  })
})
