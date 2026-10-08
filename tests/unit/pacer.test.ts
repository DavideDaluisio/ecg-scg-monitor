import { describe, expect, it, vi } from 'vitest'
import { Pacer } from '../../src/sources/pacer.ts'

// A clock the test moves by hand (milliseconds).
function makeClock() {
  const clock = { ms: 1000 }
  return { clock, now: () => clock.ms }
}

describe('Pacer', () => {
  it('returns the seconds elapsed since start()', () => {
    const { clock, now } = makeClock()
    const pacer = new Pacer(now)
    pacer.start()
    expect(pacer.elapsedSeconds()).toBe(0)
    clock.ms += 250
    expect(pacer.elapsedSeconds()).toBe(0.25)
    clock.ms += 500
    expect(pacer.elapsedSeconds()).toBe(0.75)
  })

  it('start() sets t = 0 again', () => {
    const { clock, now } = makeClock()
    const pacer = new Pacer(now)
    pacer.start()
    clock.ms += 800
    pacer.elapsedSeconds()
    pacer.start()
    clock.ms += 100
    expect(pacer.elapsedSeconds()).toBeCloseTo(0.1, 9)
  })

  it('advances at most 1 s per call after a long gap, then continues normally from there', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    const { clock, now } = makeClock()
    const pacer = new Pacer(now)
    pacer.start()
    clock.ms += 500
    expect(pacer.elapsedSeconds()).toBe(0.5)

    clock.ms += 5000 // the tab was in the background
    expect(pacer.elapsedSeconds()).toBe(1.5)
    expect(info).toHaveBeenCalledOnce()

    // No catching up of the skipped 4.5 s.
    clock.ms += 200
    expect(pacer.elapsedSeconds()).toBeCloseTo(1.7, 9)
    info.mockRestore()
  })
})
