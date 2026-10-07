import { describe, expect, it } from 'vitest'
import { updateYRange, type YRange } from '../../src/plot/autoscale.ts'

function emptyRange(): YRange {
  return { min: NaN, max: NaN }
}

describe('updateYRange', () => {
  it('starts at the data range plus 10 % padding', () => {
    const range = emptyRange()
    updateYRange(range, 0, 10)
    expect(range.min).toBeCloseTo(-1, 9)
    expect(range.max).toBeCloseTo(11, 9)
  })

  it('stays unset while there is no data', () => {
    const range = emptyRange()
    updateYRange(range, NaN, NaN)
    expect(range.min).toBeNaN()
    expect(range.max).toBeNaN()
  })

  it('grows at once when a bigger peak appears', () => {
    const range = emptyRange()
    updateYRange(range, 0, 10)
    updateYRange(range, 0, 20)
    expect(range.max).toBeCloseTo(22, 9)
  })

  it('shrinks slowly, then converges on the new range', () => {
    const range = emptyRange()
    updateYRange(range, 0, 20)
    updateYRange(range, 0, 10)
    expect(range.max).toBeLessThan(22)
    expect(range.max).toBeGreaterThan(21) // no jump in one frame
    for (let frame = 0; frame < 300; frame++) updateYRange(range, 0, 10)
    expect(range.max).toBeCloseTo(11, 3)
    expect(range.min).toBeCloseTo(-1, 3)
  })

  it('keeps a minimum span on a flat line', () => {
    const range = emptyRange()
    updateYRange(range, 1600, 1600) // flat DC offset, in mV
    expect(range.max - range.min).toBeGreaterThan(0.1)
    expect((range.max + range.min) / 2).toBeCloseTo(1600, 9)
  })
})
