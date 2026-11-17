// The whole live path, as in src/state/session.ts: synthetic ECG and SCG blocks → RingBuffer.push → PqrstTracker
// (R peaks) → AoTracker.addRPeak, and AoTracker.update after every block. The synthetic AO peak is exactly at
// R + rToAoS (src/sources/syntheticSignals.ts).
import { describe, expect, it } from 'vitest'
import { AoTracker } from '../../src/analysis/aoTracker.ts'
import { PqrstTracker } from '../../src/analysis/pqrstTracker.ts'
import { RingBuffer } from '../../src/core/ringBuffer.ts'
import type { ChannelId } from '../../src/core/types.ts'
import {
  createGaussianNoise,
  ecgAt,
  rPeakTimeS,
  scgAt,
} from '../../src/sources/syntheticSignals.ts'

const BUFFER_SECONDS = 30 // as in src/state/session.ts
const BLOCK_S = 0.02 // the sources emit about every 20 ms

interface SessionOptions {
  heartRateBpm: number
  rToAoS: number
  ecgFs: number
  scgFs: number
  seconds: number
  noise?: boolean // the noise levels of SyntheticSource
  scgLagS?: number // the SCG blocks arrive this much later than the ECG blocks of the same instant
}

function runSession(options: SessionOptions) {
  const { heartRateBpm, rToAoS, ecgFs, scgFs, seconds } = options
  const scgLagS = options.scgLagS ?? 0
  const ecgBuffer = new RingBuffer(BUFFER_SECONDS * ecgFs)
  const scgBuffer = new RingBuffer(BUFFER_SECONDS * scgFs)
  const ao = new AoTracker(scgBuffer, scgFs, ecgFs)
  const pqrst = new PqrstTracker(ecgBuffer, ecgFs, (beat) => ao.addRPeak(beat.r.sampleIndex))
  const ecgNoise = createGaussianNoise(1, options.noise ? 10e-6 : 0)
  const scgNoise = createGaussianNoise(2, options.noise ? 0.5e-3 : 0)

  let ecgNext = 0 // next sample index of each channel
  let scgNext = 0
  let seq = 0
  function emit(channel: ChannelId, fs: number, first: number, end: number) {
    const samples = new Float32Array(end - first)
    for (let i = 0; i < samples.length; i++) {
      const t = (first + i) / fs
      samples[i] =
        channel === 'ecg'
          ? ecgAt(t, heartRateBpm) + ecgNoise()
          : scgAt(t, heartRateBpm, rToAoS) + scgNoise()
    }
    const block = { channel, seq: seq++, firstSampleIndex: first, fs, samples }
    // As in session.ts: push to the ring buffer, feed the PQRST tracker (ECG), then update the AO tracker.
    ;(channel === 'ecg' ? ecgBuffer : scgBuffer).push(block.firstSampleIndex, block.samples)
    if (channel === 'ecg') pqrst.push(block)
    ao.update()
  }
  for (let t = BLOCK_S; t <= seconds + scgLagS + 1e-9; t += BLOCK_S) {
    const ecgEnd = Math.round(Math.min(t, seconds) * ecgFs)
    if (ecgEnd > ecgNext) emit('ecg', ecgFs, ecgNext, ecgEnd)
    ecgNext = Math.max(ecgNext, ecgEnd)
    const scgEnd = Math.round(Math.max(0, t - scgLagS) * scgFs)
    if (scgEnd > scgNext) emit('scg', scgFs, scgNext, scgEnd)
    scgNext = Math.max(scgNext, scgEnd)
  }
  return { beats: pqrst.beats, points: ao.points }
}

// Distance (s) from `timeS` to the nearest synthetic AO peak.
function distanceToAoS(timeS: number, heartRateBpm: number, rToAoS: number): number {
  const beat = Math.round(((timeS - rToAoS - rPeakTimeS(0, heartRateBpm)) * heartRateBpm) / 60)
  return Math.abs(timeS - (rPeakTimeS(beat, heartRateBpm) + rToAoS))
}

describe('AoTracker', () => {
  it.each([
    { heartRateBpm: 72, rToAoS: 0.08, ecgFs: 3000, scgFs: 3000 },
    { heartRateBpm: 60, rToAoS: 0.12, ecgFs: 500, scgFs: 3000 },
    { heartRateBpm: 100, rToAoS: 0.1, ecgFs: 3000, scgFs: 500 },
    { heartRateBpm: 150, rToAoS: 0.1, ecgFs: 1000, scgFs: 1000 },
  ])(
    'finds the AO of every detected beat to the sample: $heartRateBpm bpm, ECG $ecgFs Hz, SCG $scgFs Hz',
    ({ heartRateBpm, rToAoS, ecgFs, scgFs }) => {
      const { beats, points } = runSession({ heartRateBpm, rToAoS, ecgFs, scgFs, seconds: 15 })
      expect(beats.length).toBeGreaterThanOrEqual(10)
      expect(points.length).toBe(beats.length) // one AO per beat
      for (const [i, point] of points.entries()) {
        const aoS = point.sampleIndex / scgFs
        expect(distanceToAoS(aoS, heartRateBpm, rToAoS)).toBeLessThanOrEqual(1 / scgFs) // ±1 sample
        // The AO of the beat of the same R peak.
        expect(Math.abs(aoS - beats[i].r.sampleIndex / ecgFs - rToAoS)).toBeLessThanOrEqual(0.003)
      }
    },
  )

  it('stays within 3 ms of the AO peaks with the synthetic noise', () => {
    const { beats, points } = runSession({
      heartRateBpm: 72,
      rToAoS: 0.08,
      ecgFs: 3000,
      scgFs: 3000,
      seconds: 15,
      noise: true,
    })
    expect(points.length).toBe(beats.length)
    expect(points.length).toBeGreaterThanOrEqual(15)
    for (const point of points) {
      expect(distanceToAoS(point.sampleIndex / 3000, 72, 0.08)).toBeLessThanOrEqual(0.003)
    }
  })

  it('waits for the SCG when its blocks arrive later than the ECG', () => {
    const options = { heartRateBpm: 72, rToAoS: 0.08, ecgFs: 1000, scgFs: 1000, seconds: 12 }
    const inStep = runSession(options).points
    const late = runSession({ ...options, scgLagS: 0.8 }).points // the R peaks come before their SCG
    expect(late.length).toBe(inStep.length)
    expect(late.map((p) => p.sampleIndex)).toEqual(inStep.map((p) => p.sampleIndex))
  })

  it('finds nothing when the AO is outside its window (R→AO longer than 250 ms)', () => {
    const { beats, points } = runSession({
      heartRateBpm: 60,
      rToAoS: 0.3,
      ecgFs: 1000,
      scgFs: 1000,
      seconds: 12,
    })
    expect(beats.length).toBeGreaterThan(0)
    expect(points).toEqual([])
  })

  it('keeps at most 300 AO peaks, the newest ones', () => {
    const fs = 250
    const { points } = runSession({
      heartRateBpm: 180,
      rToAoS: 0.08,
      ecgFs: fs,
      scgFs: fs,
      seconds: 110, // ≈ 330 beats
    })
    expect(points.length).toBe(300)
    expect(points.at(-1)!.sampleIndex / fs).toBeGreaterThan(108)
  })
})
