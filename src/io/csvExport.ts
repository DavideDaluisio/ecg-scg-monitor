// CSV export of a saved session, for Python, MATLAB and scripts/check_export.py (format: docs/data-formats.md,
// "CSV export"). For people, the Excel export (xlsxExport.ts) is easier to read. Pure functions: no DOM, no database.
// Raw is sacred: every sample is written exactly (it reads back to the same Float32), missing ones are empty
// cells, and the sample index is the live session's one (never re-based or resampled).
import { sampleIndexToSeconds } from '../core/time.ts'
import { recordingZeroSeconds } from '../recording/markers.ts'
import type { SavedSession } from '../recording/types.ts'
import {
  formatSample,
  formatSeconds,
  groupByClock,
  localDateTime,
  MARKER_SEPARATOR,
  markersOnClock,
  rowRange,
  sampleAt,
  type ExportChannel,
} from './exportShared.ts'

/** One CSV file. */
export interface ExportFile {
  fileName: string
  // The header, then 5,000 rows per part. Each part is built only when it is read (a generator), so a long
  // session never sits in memory as one huge text, and the caller can let the browser breathe between parts.
  // Can be read once.
  parts: Iterable<string>
}

// Byte-order mark: tells Excel the file is UTF-8, so "·", "→" and accented marker labels show correctly.
// pandas, MATLAB and scripts/check_export.py skip it.
const BOM = String.fromCharCode(0xfeff)
const FORMAT_LINE =
  '# ECG/SCG Monitor export - format v2 - standard CSV (comma separator and point decimals)'
// About 10 ms of work on a laptop (≈ 40 ms on a phone): short enough not to stall the live plots and source.
const ROWS_PER_PART = 5_000

/**
 * One file with every channel when they all have the same fs, otherwise one file per channel
 * (`<name>_ecg.csv`, `<name>_scg.csv`), each on its own sample clock.
 */
export function buildCsvExport(session: SavedSession, channels: ExportChannel[]): ExportFile[] {
  if (channels.length === 0) throw new Error(`${session.name} has no recorded channel`)
  // time_s = 0 at the start of the recording: the first recorded sample of any channel. The same zero for every
  // file, so the same instant has the same time_s in the ECG and in the SCG file.
  const zeroS = recordingZeroSeconds(channels)
  const groups = groupByClock(channels)
  if (groups.length === 1) {
    return [buildFile(`${session.name}.csv`, session, groups[0], zeroS)]
  }
  return groups.map((group) =>
    buildFile(`${session.name}_${group[0].id}.csv`, session, group, zeroS),
  )
}

/** A CSV cell: quoted when the text contains a comma, a quote, a line break or '#' (comment character). */
export function csvField(text: string): string {
  if (!/[,"#\r\n]/.test(text)) return text
  return `"${text.replace(/"/g, '""')}"`
}

function buildFile(
  fileName: string,
  session: SavedSession,
  channels: ExportChannel[],
  zeroS: number,
): ExportFile {
  const fs = channels[0].fs
  const markerLabels = markersOnClock(session, fs)
  const { first, end } = rowRange(channels, markerLabels)
  const header = headerLines(session, channels, fs, end - first)
  return {
    fileName,
    parts: fileParts(BOM + header.join('\n') + '\n', channels, fs, zeroS, markerLabels, first, end),
  }
}

// The lines before the data: what the file is, when and how it was recorded, and what each column means.
// They start with '#', so `comment='#'` skips them; in Excel each one stays in one cell of column A.
function headerLines(
  session: SavedSession,
  channels: ExportChannel[],
  fs: number,
  rowCount: number,
): string[] {
  return [
    FORMAT_LINE,
    `# Session: ${session.name}`,
    `# Recorded: ${localDateTime(session.recordedAtIso)}`,
    `# Acquisition started: ${localDateTime(session.startIso)} = sample_index 0`,
    `# Duration (s): ${(rowCount / fs).toFixed(3)}`,
    `# Sampling rate (Hz): ${fs}`,
    `# Source: ${session.source}`,
    `# Source details: ${headerText(session.description)}`,
    `# Markers: ${session.markers.length}`,
    ...Object.entries(session.settings).map(
      ([key, value]) => `# ${key}: ${headerText(String(value))}`,
    ),
    '#',
    '# Columns:',
    '#   sample_index = sample number since the acquisition started (the number the app shows for a marker)',
    '#   time_s = seconds since the start of this recording',
    ...channels.map(
      (channel) =>
        `#   ${channel.id}_V = ${channel.id.toUpperCase()} in volts exactly as received ` +
        '(not filtered or resampled by the app) - empty cell = missing sample',
    ),
    `#   marker = label of the marker placed on this sample ('${MARKER_SEPARATOR.trim()}' between several)`,
    "# Python: pandas.read_csv with comment='#'",
    ['sample_index', 'time_s', ...channels.map((c) => `${c.id}_V`), 'marker'].join(','),
  ]
}

// A free text (description, setting) on one header line: no line breaks, and no ',' or ';', so that Excel keeps
// the line in one cell whatever the list separator of the computer ("72,000 samples" → "72 000 samples").
function headerText(text: string): string {
  return text.replace(/[\r\n]+/g, ' ').replace(/\s*[,;]\s*/g, ' ')
}

// A generator (function*): each `yield` hands one part to the reader, and the loop continues only when the
// reader asks for the next part.
function* fileParts(
  header: string,
  channels: ExportChannel[],
  fs: number,
  zeroS: number,
  markerLabels: Map<number, string[]>,
  first: number,
  end: number,
): Generator<string> {
  yield header
  let rows: string[] = []
  for (let index = first; index < end; index++) {
    let row = `${index},${formatSeconds(sampleIndexToSeconds(index, fs) - zeroS)}`
    for (const channel of channels) row += ',' + formatSample(sampleAt(channel, index))
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
