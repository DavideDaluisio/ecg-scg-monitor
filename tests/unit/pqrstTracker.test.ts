// The whole live path: synthetic ECG blocks → RingBuffer.push → PqrstTracker.push, as in src/state/session.ts.
import { describe, expect, it } from 'vitest'
import { PqrstTracker } from '../../src/analysis/pqrstTracker.ts'
import { RingBuffer } from '../../src/core/ringBuffer.ts'
import { createGaussianNoise, ecgAt, rPeakTimeS } from '../../src/sources/syntheticSignals.ts'

const BUFFER_SECONDS = 30 // as in src/state/session.ts

function runTracker(heartRateBpm: number, fs: number, seconds: number, noiseRmsV = 0) {
  const buffer = new RingBuffer(BUFFER_SECONDS * fs)
  const tracker = new PqrstTracker(buffer, fs)
  const noise = createGaussianNoise(3, noiseRmsV)
  const blockLength = Math.round(0.02 * fs)
  let seq = 0
  for (let first = 0; first < seconds * fs; first += blockLength) {
    const samples = new Float32Array(blockLength)
    for (let i = 0; i < blockLength; i++)
      samples[i] = ecgAt((first + i) / fs, heartRateBpm) + noise()
    const block = { channel: 'ecg' as const, seq: seq++, firstSampleIndex: first, fs, samples }
    buffer.push(block.firstSampleIndex, block.samples)
    tracker.push(block)
  }
  return tracker.beats
}

// The synthetic R peak nearest to `timeS`.
function nearestR(timeS: number, heartRateBpm: number): number {
  const beat = Math.round(((timeS - rPeakTimeS(0, heartRateBpm)) * heartRateBpm) / 60)
  return rPeakTimeS(beat, heartRateBpm)
}

describe('PqrstTracker', () => {
  it.each([
    { heartRateBpm: 72, fs: 3000 },
    { heartRateBpm: 60, fs: 500 },
    { heartRateBpm: 100, fs: 250 },
  ])(
    'locates every beat with its five waves: $heartRateBpm bpm, $fs Hz',
    ({ heartRateBpm, fs }) => {
      const seconds = 15
      const beats = runTracker(heartRateBpm, fs, seconds)
      // Every beat after the 2-s learning phase that had time to be completed (T window: ~0.5 s after R).
      let expected = 0
      for (let k = 0; rPeakTimeS(k, heartRateBpm) < seconds - 0.6; k++) {
        if (rPeakTimeS(k, heartRateBpm) > 2.3) expected++
      }
      expect(beats.length).toBeGreaterThanOrEqual(expected)
      expect(beats.length).toBeLessThanOrEqual(expected + 1) // the beat right at the end of the learning phase

      for (const [i, beat] of beats.entries()) {
        const rS = beat.r.sampleIndex / fs
        expect(Math.abs(rS - nearestR(rS, heartRateBpm))).toBeLessThanOrEqual(1 / fs) // ±1 sample
        // The first beat has no previous R–R: its P window (default R–R 0.8 s) may start on the previous T wave,
        // whose higher end then hides P. From the second beat on, the windows follow the heart rate.
        if (i > 0) expect(beat.p).not.toBeNull()
        expect(beat.q).not.toBeNull()
        expect(beat.s).not.toBeNull()
        expect(beat.t).not.toBeNull()
      }
      // Oldest first, no beat twice.
      for (let i = 1; i < beats.length; i++) {
        expect(beats[i].r.sampleIndex).toBeGreaterThan(beats[i - 1].r.sampleIndex)
      }
    },
  )

  it('stays within 3 ms of the R peaks with the synthetic noise', () => {
    const fs = 3000
    const beats = runTracker(72, fs, 15, 10e-6) // ECG_NOISE_RMS_V of SyntheticSource
    expect(beats.length).toBeGreaterThanOrEqual(15)
    for (const beat of beats) {
      const rS = beat.r.sampleIndex / fs
      expect(Math.abs(rS - nearestR(rS, 72))).toBeLessThanOrEqual(0.003)
    }
  })

  it('keeps at most 300 beats, the newest ones', () => {
    const fs = 250
    const beats = runTracker(180, fs, 110) // ≈ 330 beats
    expect(beats.length).toBe(300)
    expect(beats.at(-1)!.r.sampleIndex / fs).toBeGreaterThan(108)
  })
})
