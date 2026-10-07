import { describe, expect, it } from 'vitest'
import { sampleIndexToSeconds, secondsToSampleIndex } from '../../src/core/time.ts'

describe('sampleIndexToSeconds', () => {
  it('divides the index by fs', () => {
    expect(sampleIndexToSeconds(72000, 3000)).toBe(24)
    expect(sampleIndexToSeconds(256, 512)).toBe(0.5)
  })
})

describe('secondsToSampleIndex', () => {
  it('rounds to the nearest sample', () => {
    expect(secondsToSampleIndex(24, 3000)).toBe(72000)
    expect(secondsToSampleIndex(0.000333, 3000)).toBe(1)
  })

  it('round-trips with sampleIndexToSeconds on different rates', () => {
    for (const fs of [512, 3000]) {
      expect(secondsToSampleIndex(sampleIndexToSeconds(12345, fs), fs)).toBe(12345)
    }
  })
})
