import { describe, expect, it } from 'vitest'
import { ChannelChunker } from '../../src/recording/chunker.ts'

interface Chunk {
  first: number
  values: number[]
}

// A chunker that collects what it emits, as plain arrays (NaN stays NaN).
function collectingChunker(startIndex: number, chunkLength: number) {
  const chunks: Chunk[] = []
  const chunker = new ChannelChunker(startIndex, chunkLength, (first, samples) =>
    chunks.push({ first, values: Array.from(samples) }),
  )
  return { chunker, chunks }
}

function range(from: number, to: number): Float32Array {
  return Float32Array.from({ length: to - from }, (_, i) => from + i)
}

describe('ChannelChunker', () => {
  it('emits full chunks aligned on the start index, and the tail on flush', () => {
    const { chunker, chunks } = collectingChunker(100, 4)
    chunker.push(100, range(100, 103))
    expect(chunks).toEqual([]) // not full yet
    chunker.push(103, range(103, 110))
    expect(chunks).toEqual([
      { first: 100, values: [100, 101, 102, 103] },
      { first: 104, values: [104, 105, 106, 107] },
    ])
    chunker.flush()
    expect(chunks[2]).toEqual({ first: 108, values: [108, 109] })
    expect(chunker.nextIndex).toBe(110)
  })

  it('ignores the samples before the start index', () => {
    const { chunker, chunks } = collectingChunker(5, 3)
    chunker.push(0, range(0, 8)) // a block that began before Record was pressed
    chunker.flush()
    expect(chunks).toEqual([{ first: 5, values: [5, 6, 7] }])
  })

  it('records a gap as NaN, also across a chunk border, so the index stays continuous', () => {
    const { chunker, chunks } = collectingChunker(0, 4)
    chunker.push(0, range(0, 3))
    chunker.push(6, range(6, 8)) // samples 3, 4, 5 never arrived
    chunker.flush()
    expect(chunks).toEqual([
      { first: 0, values: [0, 1, 2, NaN] },
      { first: 4, values: [NaN, NaN, 6, 7] },
    ])
  })

  it('records a gap at the very start as NaN', () => {
    const { chunker, chunks } = collectingChunker(10, 4)
    chunker.push(12, range(12, 14))
    chunker.flush()
    expect(chunks).toEqual([{ first: 10, values: [NaN, NaN, 12, 13] }])
  })

  it('ignores samples already recorded (overlapping block)', () => {
    const { chunker, chunks } = collectingChunker(0, 10)
    chunker.push(0, range(0, 5))
    chunker.push(3, Float32Array.from([-3, -4, 5, 6])) // 3 and 4 again, with other values
    chunker.flush()
    expect(chunks).toEqual([{ first: 0, values: [0, 1, 2, 3, 4, 5, 6] }])
  })

  it('gives every chunk its own array, so the receiver may keep it', () => {
    const { chunker, chunks } = collectingChunker(0, 2)
    const kept: Float32Array[] = []
    const keeping = new ChannelChunker(0, 2, (_, samples) => kept.push(samples))
    chunker.push(0, range(0, 4))
    keeping.push(0, range(0, 4))
    expect(chunks).toHaveLength(2)
    expect(kept[0]).not.toBe(kept[1])
    expect(Array.from(kept[0])).toEqual([0, 1])
  })

  it('emits nothing on flush when the current chunk is empty', () => {
    const { chunker, chunks } = collectingChunker(0, 2)
    chunker.push(0, range(0, 2))
    chunker.flush()
    chunker.flush()
    expect(chunks).toEqual([{ first: 0, values: [0, 1] }])
  })

  it('rejects a chunk length that is not a positive integer', () => {
    expect(() => new ChannelChunker(0, 0, () => {})).toThrow(/positive integer/)
    expect(() => new ChannelChunker(0, 1.5, () => {})).toThrow(/positive integer/)
  })
})
