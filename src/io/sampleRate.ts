// Sample rate from the time column of a file (LVM, CSV, XLSX). See docs/data-formats.md.
// Never use 1 / Δt of a single row: times are printed with 6 decimals, so 1 / 0.000333 = 3003 Hz instead of 3000.
// Over the whole column the rounding error is spread across n − 1 intervals and disappears.
export function sampleRateFromTimes(count: number, firstTime: number, lastTime: number): number {
  if (count < 2) {
    throw new Error(`Need at least 2 samples to compute the sample rate, found ${count}`)
  }
  if (!(lastTime > firstTime)) {
    throw new Error(`Time column does not increase (first ${firstTime} s, last ${lastTime} s)`)
  }
  return Math.round((count - 1) / (lastTime - firstTime))
}
