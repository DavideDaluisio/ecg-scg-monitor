// CSV export of a saved session (format: docs/data-formats.md, "CSV export"). Pure functions: no DOM, no database.
// Raw is sacred: every sample is written exactly (it reads back to the same Float32), missing ones are empty
// cells, and the sample index is the live session's one (never re-based or resampled).
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

/** One CSV file. */
export interface ExportFile {
  fileName: string
  // The header, then 5,000 rows per part. Each part is built only when it is read (a generator), so a long
  // session never sits in memory as one huge text, and the caller can let the browser breathe between parts.
  // Can be read once.
  parts: Iterable<string>
}

const FORMAT_LINE = '# ecg-scg-monitor export v1'
const CHANNEL_ORDER: ChannelId[] = ['ecg', 'scg']
// About 10 ms of work on a laptop (≈ 40 ms on a phone): short enough not to stall the live plots and source.
const ROWS_PER_PART = 5_000
const MARKER_SEPARATOR = ' | ' // several markers on the same sample

/**
 * One file with every channel when they all have the same fs, otherwise one file per channel
 * (`<name>_ecg.csv`, `<name>_scg.csv`), each on its own sample clock.
 */
export function buildCsvExport(session: SavedSession, channels: ExportChannel[]): ExportFile[] {
  if (channels.length === 0) throw new Error(`${session.name} has no recorded channel`)
  const ordered = [...channels].sort(
    (a, b) => CHANNEL_ORDER.indexOf(a.id) - CHANNEL_ORDER.indexOf(b.id),
  )
  if (ordered.every((channel) => channel.fs === ordered[0].fs)) {
    return [buildFile(`${session.name}.csv`, session, ordered)]
  }
  return ordered.map((channel) =>
    buildFile(`${session.name}_${channel.id}.csv`, session, [channel]),
  )
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

/** A CSV cell: quoted when the text contains a separator, a quote, a line break or '#' (comment character). */
export function csvField(text: string): string {
  if (!/[",#\r\n]/.test(text)) return text
  return `"${text.replace(/"/g, '""')}"`
}

function buildFile(fileName: string, session: SavedSession, channels: ExportChannel[]): ExportFile {
  const fs = channels[0].fs
  const markerLabels = markersOnClock(session, fs)

  // Rows cover every recorded sample and every marker (a marker on a missing sample gets an empty-valued row).
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

  const header = [
    FORMAT_LINE,
    `# session=${session.name}`,
    `# start_iso=${session.startIso}`,
    `# recorded_at_iso=${session.recordedAtIso}`,
    `# fs=${fs}`,
    `# source=${session.source}`,
    `# description=${session.description}`,
    ...Object.entries(session.settings).map(([key, value]) => `# ${key}=${value}`),
    ['sample_index', 'time_s', ...channels.map((channel) => `${channel.id}_V`), 'marker'].join(','),
  ]
  return {
    fileName,
    parts: fileParts(header.join('\n') + '\n', channels, fs, markerLabels, first, end),
  }
}

// A generator (function*): each `yield` hands one part to the reader, and the loop continues only when the
// reader asks for the next part.
function* fileParts(
  header: string,
  channels: ExportChannel[],
  fs: number,
  markerLabels: Map<number, string[]>,
  first: number,
  end: number,
): Generator<string> {
  yield header
  let rows: string[] = []
  for (let index = first; index < end; index++) {
    let row = `${index},${sampleIndexToSeconds(index, fs).toFixed(6)}`
    for (const channel of channels) {
      const offset = index - channel.firstSampleIndex
      const inRange = offset >= 0 && offset < channel.samples.length
      row += ',' + (inRange ? formatSample(channel.samples[offset]) : '')
    }
    const labels = markerLabels.get(index)
    row += ',' + (labels === undefined ? '' : csvField(labels.join(MARKER_SEPARATOR)))
    rows.push(row)
    if (rows.length === ROWS_PER_PART) {
      yield rows.join('\n') + '\n'
      rows = []
    }
  }
  if (rows.length > 0) yield rows.join('\n') + '\n'
}

// Marker labels by sample index on a clock of `fs`. A marker placed on a channel with another fs moves to the
// nearest sample of this clock: round(t × fs).
function markersOnClock(session: SavedSession, fs: number): Map<number, string[]> {
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

// "1.60000" → "1.6", "2.50000e-7" → "2.5e-7", "120.000" → "120".
function removeTrailingZeros(text: string): string {
  // The common case, checked first because this runs for every sample: nothing to remove.
  if (!text.endsWith('0') && !text.includes('e')) return text
  const [mantissa, exponent] = text.split('e')
  const trimmed = mantissa.includes('.') ? mantissa.replace(/\.?0+$/, '') : mantissa
  return exponent === undefined ? trimmed : `${trimmed}e${exponent}`
}
