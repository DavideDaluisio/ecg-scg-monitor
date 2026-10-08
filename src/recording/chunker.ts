// Cuts the samples of one channel into fixed-length chunks for IndexedDB. Pure: no database, no timers.
// Same rules as RingBuffer.push (src/core/ringBuffer.ts): the index stays continuous, gaps become NaN.

export type ChunkCallback = (firstSampleIndex: number, samples: Float32Array) => void

export class ChannelChunker {
  private readonly chunkLength: number
  private readonly onChunk: ChunkCallback
  private chunk: Float32Array
  private chunkStart: number // sample index of chunk[0]
  private filled = 0 // samples written into the current chunk

  /**
   * Records from `startIndex` on: earlier samples are ignored. Chunk k starts at startIndex + k × chunkLength.
   * `onChunk` receives each full chunk (a new array every time, so the receiver may keep it).
   */
  constructor(startIndex: number, chunkLength: number, onChunk: ChunkCallback) {
    if (!Number.isInteger(chunkLength) || chunkLength <= 0) {
      throw new Error(`Chunk length must be a positive integer, got ${chunkLength}`)
    }
    this.chunkLength = chunkLength
    this.onChunk = onChunk
    this.chunk = new Float32Array(chunkLength)
    this.chunkStart = startIndex
  }

  /** Index of the next sample to be recorded. */
  get nextIndex(): number {
    return this.chunkStart + this.filled
  }

  /**
   * Adds a block that starts at firstSampleIndex. Missing samples before it are recorded as NaN; samples before
   * the start or already recorded (overlap) are ignored.
   */
  push(firstSampleIndex: number, samples: Float32Array): void {
    let next = this.nextIndex
    while (next < firstSampleIndex) {
      this.write(NaN)
      next++
    }
    for (let i = Math.max(0, next - firstSampleIndex); i < samples.length; i++) {
      this.write(samples[i])
    }
  }

  /** Emits the samples of the unfinished chunk, if any (called when the recording stops). */
  flush(): void {
    if (this.filled === 0) return
    const tail = this.chunk.slice(0, this.filled)
    this.chunkStart += this.filled
    this.filled = 0
    this.onChunk(this.chunkStart - tail.length, tail)
  }

  private write(value: number): void {
    this.chunk[this.filled] = value
    this.filled++
    if (this.filled === this.chunkLength) {
      const full = this.chunk
      const fullStart = this.chunkStart
      this.chunk = new Float32Array(this.chunkLength)
      this.chunkStart += this.chunkLength
      this.filled = 0
      this.onChunk(fullStart, full)
    }
  }
}
