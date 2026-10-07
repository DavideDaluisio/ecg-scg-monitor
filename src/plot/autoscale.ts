// Y-axis autoscale on the visible window. It grows at once (a peak is never clipped) but shrinks slowly,
// so the axis does not jump on every frame.

export interface YRange {
  min: number // NaN until the first data arrives
  max: number
}

const PADDING = 0.1 // 10 % of the data span above and below
const SHRINK_RATE = 0.05 // fraction of the distance to the target covered per frame when shrinking
const MIN_SPAN = 0.1 // never zoom in closer than this (same unit as the data), e.g. on a flat line

/**
 * Moves `range` towards the data min/max (+ padding). Updates `range` in place so nothing is allocated per frame.
 * dataMin/dataMax are NaN when there is no data on screen: the range is then left as it is.
 */
export function updateYRange(range: YRange, dataMin: number, dataMax: number): void {
  if (Number.isNaN(dataMin) || Number.isNaN(dataMax)) return

  const span = Math.max(dataMax - dataMin, MIN_SPAN)
  const center = (dataMin + dataMax) / 2
  const targetMin = center - span * (0.5 + PADDING)
  const targetMax = center + span * (0.5 + PADDING)

  if (Number.isNaN(range.min) || targetMin < range.min) range.min = targetMin
  else range.min += (targetMin - range.min) * SHRINK_RATE

  if (Number.isNaN(range.max) || targetMax > range.max) range.max = targetMax
  else range.max += (targetMax - range.max) * SHRINK_RATE
}
