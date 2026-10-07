import { describe, expect, it } from 'vitest'
import { RingBuffer } from '../../src/core/ringBuffer.ts'

// Samples whose value equals their index make the expected output easy to read.
function ramp(first: number, count: number): Float32Array {
  return Float32Array.from({ length: count }, (_, i) => first + i)
}

function read(buffer: RingBuffer, start: number, count: number): number[] {
  const out = new Float32Array(count)
  buffer.copyRange(start, out)
  return Array.from(out)
}

describe('RingBuffer', () => {
  it('rejects a capacity that is not a positive integer', () => {
    expect(() => new RingBuffer(0)).toThrow()
    expect(() => new RingBuffer(2.5)).toThrow()
  })

  it('stores consecutive blocks and tracks endIndex', () => {
    const buffer = new RingBuffer(10)
    buffer.push(0, ramp(0, 3))
    buffer.push(3, ramp(3, 4))
    expect(buffer.endIndex).toBe(7)
    expect(buffer.startIndex).toBe(0)
    expect(read(buffer, 0, 7)).toEqual([0, 1, 2, 3, 4, 5, 6])
  })

  it('wraps around and keeps only the last `capacity` samples', () => {
    const buffer = new RingBuffer(5)
    buffer.push(0, ramp(0, 4))
    buffer.push(4, ramp(4, 4)) // indices 4..7 wrap around the end of the array
    expect(buffer.endIndex).toBe(8)
    expect(buffer.startIndex).toBe(3)
    expect(read(buffer, 3, 5)).toEqual([3, 4, 5, 6, 7])
  })

  it('returns NaN for samples that were overwritten or not written yet', () => {
    const buffer = new RingBuffer(5)
    buffer.push(0, ramp(0, 8))
    expect(read(buffer, 1, 9)).toEqual([NaN, NaN, 3, 4, 5, 6, 7, NaN, NaN])
  })

  it('reading more than was written leaves the rest NaN', () => {
    const buffer = new RingBuffer(100)
    buffer.push(0, ramp(0, 2))
    expect(read(buffer, 0, 4)).toEqual([0, 1, NaN, NaN])
  })

  it('fills a gap between blocks with NaN so the index stays continuous', () => {
    const buffer = new RingBuffer(10)
    buffer.push(0, ramp(0, 2))
    buffer.push(4, ramp(4, 2)) // samples 2 and 3 were lost
    expect(buffer.endIndex).toBe(6)
    expect(read(buffer, 0, 6)).toEqual([0, 1, NaN, NaN, 4, 5])
  })

  it('handles a gap longer than the whole buffer', () => {
    const buffer = new RingBuffer(4)
    buffer.push(0, ramp(0, 2))
    buffer.push(100, ramp(100, 2))
    expect(buffer.endIndex).toBe(102)
    expect(read(buffer, 98, 4)).toEqual([NaN, NaN, 100, 101])
  })

  it('keeps the tail of a block longer than the capacity', () => {
    const buffer = new RingBuffer(4)
    buffer.push(0, ramp(0, 10))
    expect(buffer.endIndex).toBe(10)
    expect(read(buffer, 6, 4)).toEqual([6, 7, 8, 9])
  })

  it('ignores samples that were already written (overlap)', () => {
    const buffer = new RingBuffer(10)
    buffer.push(0, ramp(0, 5))
    buffer.push(3, Float32Array.from([-1, -1, 5, 6]))
    expect(read(buffer, 0, 7)).toEqual([0, 1, 2, 3, 4, 5, 6])
  })

  it('preserves NaN samples written by the source', () => {
    const buffer = new RingBuffer(10)
    buffer.push(0, Float32Array.from([1, NaN, 3]))
    expect(read(buffer, 0, 3)).toEqual([1, NaN, 3])
  })
})
