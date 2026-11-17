import { describe, expect, it } from 'vitest'
import { Biquad } from '../../src/analysis/biquad.ts'

const FS = 3000

// Largest |output| over the last second of a 2-s sine, after the filter has settled.
function sineAmplitudeAfter(filter: Biquad, frequencyHz: number): number {
  filter.reset(0)
  let largest = 0
  for (let i = 0; i < 2 * FS; i++) {
    const y = filter.process(Math.sin((2 * Math.PI * frequencyHz * i) / FS))
    if (i >= FS) largest = Math.max(largest, Math.abs(y))
  }
  return largest
}

describe('Biquad', () => {
  it('low-pass: passes a constant unchanged when primed on it', () => {
    const filter = new Biquad('lowpass', 15, FS)
    filter.reset(1.6)
    for (let i = 0; i < 100; i++) expect(filter.process(1.6)).toBeCloseTo(1.6, 12)
  })

  it('low-pass 15 Hz: keeps 2 Hz and removes 200 Hz', () => {
    expect(sineAmplitudeAfter(new Biquad('lowpass', 15, FS), 2)).toBeCloseTo(1, 2)
    expect(sineAmplitudeAfter(new Biquad('lowpass', 15, FS), 200)).toBeLessThan(0.01)
  })

  it('high-pass: blocks a constant without a start-up transient when primed on it', () => {
    const filter = new Biquad('highpass', 5, FS)
    filter.reset(1.6) // the DC offset of the lab's raw ECG
    for (let i = 0; i < 100; i++) expect(Math.abs(filter.process(1.6))).toBeLessThan(1e-12)
  })

  it('high-pass 5 Hz: a step decays to zero, 50 Hz passes', () => {
    const filter = new Biquad('highpass', 5, FS)
    filter.reset(0)
    let y = 0
    for (let i = 0; i < FS; i++) y = filter.process(1)
    expect(Math.abs(y)).toBeLessThan(1e-3)
    expect(sineAmplitudeAfter(new Biquad('highpass', 5, FS), 50)).toBeCloseTo(1, 2)
  })

  it('works at the lowest synthetic fs (250 Hz)', () => {
    const filter = new Biquad('lowpass', 15, 250)
    filter.reset(1)
    expect(filter.process(1)).toBeCloseTo(1, 12)
  })

  it('rejects a cut-off outside (0, fs/2)', () => {
    expect(() => new Biquad('lowpass', 0, FS)).toThrow(/cut-off/)
    expect(() => new Biquad('lowpass', 1500, FS)).toThrow(/cut-off/)
  })
})
