// Fixed-size buffer holding the most recent samples of one channel, addressed by sample index.
// Preallocated once: push() and copyRange() never allocate, so they are safe in the hot path.
export class RingBuffer {
  readonly capacity: number
  private readonly data: Float32Array
  // Index of the next sample to be written (= number of samples written since the session started).
  private nextIndex = 0

  constructor(capacity: number) {
    if (!Number.isInteger(capacity) || capacity <= 0) {
      throw new Error(`RingBuffer capacity must be a positive integer, got ${capacity}`)
    }
    this.capacity = capacity
    this.data = new Float32Array(capacity)
  }

  /** Index one past the newest sample. */
  get endIndex(): number {
    return this.nextIndex
  }

  /** Index of the oldest sample still held. */
  get startIndex(): number {
    return Math.max(0, this.nextIndex - this.capacity)
  }

  /**
   * Writes samples that start at firstSampleIndex.
   * If samples are missing before firstSampleIndex, the gap is filled with NaN so the index stays continuous.
   * Samples older than what is already written (overlap) are ignored.
   */
  push(firstSampleIndex: number, samples: Float32Array): void {
    if (firstSampleIndex > this.nextIndex) {
      this.writeNaN(firstSampleIndex - this.nextIndex)
    }

    // Skip the part of the block that was already written.
    let offset = this.nextIndex - firstSampleIndex
    if (offset >= samples.length) return
    // Only the last `capacity` samples can be kept.
    const remaining = samples.length - offset
    if (remaining > this.capacity) {
      offset += remaining - this.capacity
      this.nextIndex = firstSampleIndex + offset
    }

    // A plain loop instead of data.set(samples.subarray(...)): subarray() would allocate a view on every call.
    for (let i = offset; i < samples.length; i++) {
      this.data[this.nextIndex % this.capacity] = samples[i]
      this.nextIndex++
    }
  }

  /**
   * Copies out.length samples starting at startIndex into out.
   * Samples that are too old (already overwritten) or not written yet become NaN.
   */
  copyRange(startIndex: number, out: Float32Array): void {
    const oldest = this.startIndex
    for (let i = 0; i < out.length; i++) {
      const index = startIndex + i
      // if/else on purpose: V8 boxes the result of `cond ? float : NaN` into a new heap number on every sample
      // (≈ 1 MB of garbage per frame with two panels).
      if (index >= oldest && index < this.nextIndex) out[i] = this.data[index % this.capacity]
      else out[i] = NaN
    }
  }

  private writeNaN(count: number): void {
    const toWrite = Math.min(count, this.capacity)
    // Jumping ahead past the whole buffer: nothing old survives anyway.
    this.nextIndex += count - toWrite
    for (let i = 0; i < toWrite; i++) {
      this.data[this.nextIndex % this.capacity] = NaN
      this.nextIndex++
    }
  }
}
