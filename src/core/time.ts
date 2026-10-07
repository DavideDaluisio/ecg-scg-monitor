// Time on a channel is its sample index: t = index / fs of that channel (never wall-clock time).

export function sampleIndexToSeconds(index: number, fs: number): number {
  return index / fs
}

export function secondsToSampleIndex(seconds: number, fs: number): number {
  return Math.round(seconds * fs)
}
