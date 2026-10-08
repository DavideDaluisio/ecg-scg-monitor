import { describe, expect, it } from 'vitest'
import { decimateMinMax } from '../../src/plot/decimate.ts'

function run(samples: number[], buckets: number, firstIndex = 0, fs = 1000, valueScale = 1) {
  const outX = new Float64Array(2 * buckets + samples.length)
  const outY: (number | null)[] = new Array(outX.length).fill(null)
  const count = decimateMinMax(
    Float32Array.from(samples),
    firstIndex,
    fs,
    buckets,
    valueScale,
    outX,
    outY,
  )
  return { count, x: Array.from(outX.subarray(0, count)), y: outY.slice(0, count) }
}

describe('decimateMinMax', () => {
  it('copies every sample when they fit in 2 points per pixel', () => {
    const { count, x, y } = run([1, 2, 3], 10, 100, 1000)
    expect(count).toBe(3)
    expect(x).toEqual([0.1, 0.101, 0.102])
    expect(y).toEqual([1, 2, 3])
  })

  it('writes exactly 2 points per pixel otherwise', () => {
    const samples = Array.from({ length: 3000 }, (_, i) => Math.sin(i / 50))
    expect(run(samples, 100).count).toBe(200)
  })

  it('keeps a one-sample peak (a QRS) that plain downsampling would miss', () => {
    const samples = new Array(30_000).fill(0)
    samples[12_345] = 1.2 // R peak
    samples[20_001] = -0.3 // S wave
    const { y } = run(samples, 500)
    expect(Math.max(...(y as number[]))).toBeCloseTo(1.2, 6) // Float32 precision
    expect(Math.min(...(y as number[]))).toBeCloseTo(-0.3, 6)
  })

  it('puts min and max at their own sample time, in order, so X stays sorted', () => {
    // 2 buckets of 4 samples: max comes before min in the first, min before max in the second.
    const { x, y } = run([0, 9, 1, -5, -2, 0, 7, 3], 2, 0, 1)
    expect(y).toEqual([9, -5, -2, 7])
    expect(x).toEqual([1, 3, 4, 6])
  })

  it('X is sorted on a real-sized window', () => {
    const samples = Array.from({ length: 30_000 }, (_, i) => Math.sin(i / 7))
    const { x } = run(samples, 1000, 5000, 3000)
    for (let i = 1; i < x.length; i++) expect(x[i]).toBeGreaterThanOrEqual(x[i - 1])
    // The first point is the min or max of the first pixel, which covers samples 5000..5029.
    expect(x[0]).toBeGreaterThanOrEqual(5000 / 3000)
    expect(x[0]).toBeLessThan(5030 / 3000)
  })

  it('turns missing samples (NaN) into null gaps', () => {
    expect(run([1, NaN, 3], 10).y).toEqual([1, null, 3])
    // Second bucket entirely NaN → two nulls; NaN inside a bucket is ignored.
    const { y } = run([1, NaN, 2, 0, NaN, NaN, NaN, NaN], 2, 0, 1)
    expect(y).toEqual([2, 0, null, null])
  })

  it('applies the value scale (volts → mV)', () => {
    expect(run([0.0012, -0.0003], 10, 0, 3000, 1000).y).toEqual([
      expect.closeTo(1.2, 6),
      expect.closeTo(-0.3, 6),
    ])
  })
})
