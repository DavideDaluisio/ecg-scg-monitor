// Min/max decimation: for each horizontal pixel keep the min and the max of the samples it covers (2 points per
// pixel). Unlike plain downsampling, a 10 ms QRS peak stays visible even with 30,000 samples on 1,000 pixels.

/**
 * Fills outX (seconds) and outY (values × valueScale, null for gaps) from `samples`, whose first element has the
 * sample index `firstIndex`. Writes no more than outX.length points and returns how many were written:
 * - samples.length <= 2 × buckets: every sample is copied as is;
 * - otherwise: 2 points per bucket, min and max in the order they occur, so X stays sorted.
 * NaN samples (missing data) become null, which uPlot draws as a gap.
 */
export function decimateMinMax(
  samples: Float32Array,
  firstIndex: number,
  fs: number,
  buckets: number,
  valueScale: number,
  outX: Float64Array,
  outY: (number | null)[],
): number {
  const sampleCount = samples.length

  if (sampleCount <= 2 * buckets) {
    for (let i = 0; i < sampleCount; i++) {
      const value = samples[i]
      outX[i] = (firstIndex + i) / fs
      outY[i] = Number.isNaN(value) ? null : value * valueScale
    }
    return sampleCount
  }

  let written = 0
  for (let bucket = 0; bucket < buckets; bucket++) {
    const start = Math.floor((bucket * sampleCount) / buckets)
    const end = Math.floor(((bucket + 1) * sampleCount) / buckets)

    let minIndex = -1
    let maxIndex = -1
    for (let i = start; i < end; i++) {
      const value = samples[i]
      if (Number.isNaN(value)) continue
      if (minIndex === -1 || value < samples[minIndex]) minIndex = i
      if (maxIndex === -1 || value > samples[maxIndex]) maxIndex = i
    }

    if (minIndex === -1) {
      // The whole bucket is missing: two null points keep the gap visible.
      outX[written] = (firstIndex + start) / fs
      outY[written++] = null
      outX[written] = (firstIndex + end - 1) / fs
      outY[written++] = null
      continue
    }

    const firstPoint = Math.min(minIndex, maxIndex)
    const secondPoint = Math.max(minIndex, maxIndex)
    outX[written] = (firstIndex + firstPoint) / fs
    outY[written++] = samples[firstPoint] * valueScale
    outX[written] = (firstIndex + secondPoint) / fs
    outY[written++] = samples[secondPoint] * valueScale
  }
  return written
}
