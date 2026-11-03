// What the CSV export and the Excel export share (formats: docs/data-formats.md). Pure functions: no DOM, no database.
// Raw is sacred: samples are written with the shortest text that reads back to the same Float32, missing ones are
// empty cells, and the sample index is the live session's one (never re-based or resampled).
import { sampleIndexToSeconds, secondsToSampleIndex } from '../core/time.ts'
import type { ChannelId } from '../core/types.ts'
import type { SavedSession } from '../recording/types.ts'

/** The samples of one recorded channel, as loaded from IndexedDB. */
export interface ExportChannel {
  id: ChannelId
  fs: number
  firstSampleIndex: number
  samples: Float32Array // volts, NaN = missing
}

/** Between the labels of several markers placed on the same sample. */
export const MARKER_SEPARATOR = ' | '

const CHANNEL_ORDER: ChannelId[] = ['ecg', 'scg']

/**
 * The channels in the order of the columns (ECG, then SCG), grouped by sample clock: one group with every channel
 * when they all have the same fs, otherwise one group per channel. Each group becomes one CSV file or one set of
 * Excel sheets, on its own clock: channels with different fs are never resampled to share rows.
 */
export function groupByClock(channels: readonly ExportChannel[]): ExportChannel[][] {
  const ordered = [...channels].sort(
    (a, b) => CHANNEL_ORDER.indexOf(a.id) - CHANNEL_ORDER.indexOf(b.id),
  )
  if (ordered.every((channel) => channel.fs === ordered[0].fs)) return [ordered]
  return ordered.map((channel) => [channel])
}

/**
 * Marker labels by sample index on a clock of `fs`. A marker placed on a channel with another fs moves to the
 * nearest sample of this clock: round(t × fs).
 */
export function markersOnClock(session: SavedSession, fs: number): Map<number, string[]> {
  const labels = new Map<number, string[]>()
  for (const marker of session.markers) {
    const markerFs = session.channels.find((channel) => channel.id === marker.channel)?.fs
    if (markerFs === undefined) continue
    const index =
      markerFs === fs
        ? marker.sampleIndex
        : secondsToSampleIndex(sampleIndexToSeconds(marker.sampleIndex, markerFs), fs)
    const list = labels.get(index)
    if (list === undefined) labels.set(index, [marker.label])
    else list.push(marker.label)
  }
  return labels
}

/**
 * The sample indices [first, end) that get a row: every recorded sample of the group and every marker (a marker on
 * a missing sample gets a row with empty values).
 */
export function rowRange(
  channels: readonly ExportChannel[],
  markerLabels: Map<number, string[]>,
): { first: number; end: number } {
  let first = Infinity
  let end = -Infinity
  for (const channel of channels) {
    first = Math.min(first, channel.firstSampleIndex)
    end = Math.max(end, channel.firstSampleIndex + channel.samples.length)
  }
  for (const index of markerLabels.keys()) {
    first = Math.min(first, index)
    end = Math.max(end, index + 1)
  }
  return { first, end }
}

/** The sample of `channel` at a live session index, NaN when the channel has none there. */
export function sampleAt(channel: ExportChannel, index: number): number {
  const offset = index - channel.firstSampleIndex
  return offset >= 0 && offset < channel.samples.length ? channel.samples[offset] : NaN
}

/**
 * The shortest decimal text that reads back to exactly the same Float32 value (e.g. 1.605213, not
 * 1.6052130460739136). Empty for NaN (missing sample).
 */
export function formatSample(value: number): string {
  if (Number.isNaN(value)) return ''
  if (value === 0 || !Number.isFinite(value)) return String(value)
  // A Float32 needs at most 9 significant digits. Starting at 6 gives the shortest text anyway (trailing zeros
  // are removed) and needs fewer tries.
  for (let digits = 6; digits < 9; digits++) {
    const text = value.toPrecision(digits)
    if (Math.fround(Number(text)) === value) return removeTrailingZeros(text)
  }
  return removeTrailingZeros(value.toPrecision(9))
}

/** Seconds rounded to 1 µs ("0.000333"). A rounding error of a subtraction must not print "-0.000000". */
export function formatSeconds(seconds: number): string {
  const text = seconds.toFixed(6)
  return text === '-0.000000' ? '0.000000' : text
}

/**
 * "2026-11-03 09:54:34 local time (UTC-05:00)": the clock of the computer that exports, normally the one that
 * recorded. Easier to read than the stored ISO time, which is in UTC.
 */
export function localDateTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  const pad = (n: number) => String(n).padStart(2, '0')
  const offsetMinutes = -date.getTimezoneOffset()
  const sign = offsetMinutes >= 0 ? '+' : '-'
  const offset = `${pad(Math.floor(Math.abs(offsetMinutes) / 60))}:${pad(Math.abs(offsetMinutes) % 60)}`
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  return `${day} ${time} local time (UTC${sign}${offset})`
}

// "1.60000" → "1.6", "2.50000e-7" → "2.5e-7", "120.000" → "120".
function removeTrailingZeros(text: string): string {
  // The common case, checked first because this runs for every sample: nothing to remove.
  if (!text.endsWith('0') && !text.includes('e')) return text
  const [mantissa, exponent] = text.split('e')
  const trimmed = mantissa.includes('.') ? mantissa.replace(/\.?0+$/, '') : mantissa
  return exponent === undefined ? trimmed : `${trimmed}e${exponent}`
}
