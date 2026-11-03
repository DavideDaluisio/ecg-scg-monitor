// Excel export of a saved session (format: docs/data-formats.md, "Excel export"): one .xlsx file with an Info sheet,
// a Markers sheet and the data sheets, made to be read by people. Pure functions: no DOM, no database. zip.ts turns
// the result into the file.
// Raw is sacred: the data sheets hold every sample in volts exactly as recorded (formatSample reads back to the
// same Float32), missing ones are empty cells, and the sample index is the live session's one.
import { sampleIndexToSeconds } from '../core/time.ts'
import { markerRecordingTimeS, recordingZeroSeconds } from '../recording/markers.ts'
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
import {
  columnLetter,
  numberCell,
  rowXml,
  SHEET_END,
  sheetStart,
  smallSheet,
  STYLE,
  textCell,
  workbookFiles,
  type XlsxCell,
  type XlsxEntry,
} from './xlsxXml.ts'

export const XLSX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

/** Excel shows at most 1,048,576 rows per sheet; the first one is the header. */
export const EXCEL_MAX_DATA_ROWS = 1_048_575

/** The workbook: its file name and the files inside it (to be zipped by `zipToBlob`). */
export interface XlsxExport {
  fileName: string
  entries: XlsxEntry[]
}

export interface XlsxExportOptions {
  maxDataRowsPerSheet?: number // EXCEL_MAX_DATA_ROWS; smaller in tests, to check the split into sheets
}

// Rows of a data sheet built at a time. An Excel row is about 3 times longer than a CSV row, and it is also
// compressed: 2,000 rows keep each step short enough not to stall the live plots and source.
const ROWS_PER_PART = 2_000

// One data sheet: rows first..end-1 (live session sample indices) of channels sharing one sample clock.
interface DataSheet {
  name: string
  channels: ExportChannel[]
  fs: number
  first: number
  end: number
  markerLabels: Map<number, string[]>
}

/**
 * Sheets: Info (the session and how to read the data), Markers (one row per marker), then the data. Channels with
 * the same fs share the data sheets ("Data"); with different fs each channel has its own ("ECG data",
 * "SCG data"). A recording longer than a sheet can hold is split into sheets of whole minutes ("Data 0-5 min").
 */
export function buildXlsxExport(
  session: SavedSession,
  channels: ExportChannel[],
  options: XlsxExportOptions = {},
): XlsxExport {
  if (channels.length === 0) throw new Error(`${session.name} has no recorded channel`)
  const maxRows = options.maxDataRowsPerSheet ?? EXCEL_MAX_DATA_ROWS
  // Time (s) = 0 at the start of the recording, the same zero on every sheet (as in the CSV export).
  const zeroS = recordingZeroSeconds(channels)
  const groups = groupByClock(channels)
  const dataSheets = groups.flatMap((group) =>
    splitIntoSheets(session, group, groups.length > 1, maxRows),
  )

  const sheets: { name: string; parts: Iterable<string> }[] = [
    { name: 'Info', parts: [infoSheet(session, channels, groups.length, dataSheets, zeroS)] },
    { name: 'Markers', parts: [markersSheet(session)] },
    ...dataSheets.map((sheet) => ({ name: sheet.name, parts: dataSheetParts(sheet, zeroS) })),
  ]
  return {
    fileName: `${session.name}.xlsx`,
    entries: [
      ...workbookFiles(sheets.map((sheet) => sheet.name)),
      ...sheets.map((sheet, i) => ({
        path: `xl/worksheets/sheet${i + 1}.xml`,
        parts: sheet.parts,
      })),
    ],
  }
}

/** "05:00.000": minutes and seconds with milliseconds. */
export function minutesSeconds(seconds: number): string {
  const totalMs = Math.round(seconds * 1000)
  const minutes = Math.floor(totalMs / 60_000)
  const rest = ((totalMs - minutes * 60_000) / 1000).toFixed(3)
  return `${String(minutes).padStart(2, '0')}:${rest.padStart(6, '0')}`
}

// The data sheets of one group of channels: as many as needed, each holding a whole number of minutes.
function splitIntoSheets(
  session: SavedSession,
  channels: ExportChannel[],
  byChannel: boolean,
  maxRows: number,
): DataSheet[] {
  const fs = channels[0].fs
  const markerLabels = markersOnClock(session, fs)
  const { first, end } = rowRange(channels, markerLabels)
  const prefix = byChannel ? channels[0].id.toUpperCase() : 'Data'
  const sheet = (name: string, from: number, to: number): DataSheet => ({
    name,
    channels,
    fs,
    first: from,
    end: to,
    markerLabels,
  })

  if (end - first <= maxRows) return [sheet(byChannel ? `${prefix} data` : prefix, first, end)]

  // Whole minutes per sheet, so the sheet names are easy to read (5 min at 3000 Hz). Only above ≈ 17 kHz does a
  // minute not fit in a sheet: then the sheets are simply numbered.
  const minutes = Math.floor(maxRows / (fs * 60))
  const rowsPerSheet = minutes >= 1 ? Math.floor(minutes * 60 * fs) : maxRows
  const sheets: DataSheet[] = []
  for (let from = first, part = 0; from < end; from += rowsPerSheet, part++) {
    const to = Math.min(end, from + rowsPerSheet)
    const name =
      minutes >= 1
        ? `${prefix} ${part * minutes}-${minutesLabel(part * minutes + (to - from) / fs / 60)} min`
        : `${prefix} part ${part + 1}`
    sheets.push(sheet(name, from, to))
  }
  return sheets
}

// The end of a sheet in minutes, rounded up to 0.1 min: "5", "6.2" ("5-5 min" for a few samples would be odd).
function minutesLabel(minutes: number): string {
  const tenths = Math.ceil(Math.round(minutes * 1e6) / 1e5) / 10
  return Number.isInteger(tenths) ? String(tenths) : tenths.toFixed(1)
}

// A generator: each `yield` is one part of the sheet, built only when the zip asks for it.
function* dataSheetParts(sheet: DataSheet, zeroS: number): Generator<string> {
  const { channels, fs, markerLabels } = sheet
  const valueColumns = channels.map((_, i) => columnLetter(i + 1))
  const markerColumn = columnLetter(channels.length + 1)
  const indexColumn = columnLetter(channels.length + 2)
  const header: XlsxCell[] = [
    'Time (s)',
    ...channels.map((channel) => `${channel.id.toUpperCase()} (V)`),
    'Marker',
    'Sample index',
  ].map((title) => ({ value: title, style: STYLE.header }))

  yield sheetStart({
    columnWidths: [12, ...channels.map(() => 15), 28, 13],
    freezeHeader: true,
    selected: false,
  }) + rowXml(1, header)

  let rows = ''
  let count = 0
  for (let index = sheet.first; index < sheet.end; index++) {
    const row = index - sheet.first + 2 // row 1 is the header
    const labels = markerLabels.get(index)
    // The whole row of a marker is yellow, so it is easy to find while scrolling.
    const style = labels === undefined ? STYLE.normal : STYLE.marked
    const seconds = formatSeconds(sampleIndexToSeconds(index, fs) - zeroS)
    rows +=
      `<row r="${row}">` +
      numberCell('A', row, seconds, labels === undefined ? STYLE.seconds : STYLE.markedSeconds)
    for (let i = 0; i < channels.length; i++) {
      rows += numberCell(valueColumns[i], row, formatSample(sampleAt(channels[i], index)), style)
    }
    rows +=
      textCell(markerColumn, row, labels?.join(MARKER_SEPARATOR) ?? '', style) +
      numberCell(indexColumn, row, String(index), style) +
      '</row>'
    if (++count === ROWS_PER_PART) {
      yield rows
      rows = ''
      count = 0
    }
  }
  yield rows + SHEET_END
}

function markersSheet(session: SavedSession): string {
  const header: XlsxCell[] = ['#', 'Time (s)', 'Time (min:s)', 'Name', 'Sample index'].map(
    (title) => ({ value: title, style: STYLE.header }),
  )
  const rows: (XlsxCell | null)[][] = session.markers.map((marker, i) => {
    const seconds = markerRecordingTimeS(session.channels, marker)
    return [
      { value: i + 1 },
      { value: Number(formatSeconds(seconds)), style: STYLE.seconds },
      { value: minutesSeconds(seconds) },
      { value: marker.label },
      { value: marker.sampleIndex },
    ]
  })
  if (rows.length === 0) rows.push([null, null, null, { value: 'No markers in this recording' }])
  return smallSheet({ columnWidths: [6, 12, 14, 32, 14], freezeHeader: true, selected: false }, [
    header,
    ...rows,
  ])
}

function infoSheet(
  session: SavedSession,
  channels: ExportChannel[],
  groupCount: number,
  dataSheets: DataSheet[],
  zeroS: number,
): string {
  const field = (name: string, value: string | number): XlsxCell[] => [
    { value: name, style: STYLE.bold },
    { value },
  ]
  let durationS = 0
  for (const channel of channels) {
    const endS = (channel.firstSampleIndex + channel.samples.length) / channel.fs
    durationS = Math.max(durationS, endS - zeroS)
  }
  const sheetNames = dataSheets.map((sheet) => sheet.name)
  const isSplit = dataSheets.length > groupCount

  const rows: (XlsxCell | null)[][] = [
    [{ value: 'ECG/SCG Monitor export', style: STYLE.title }],
    [],
    field('Session', session.name),
    field('Recorded', localDateTime(session.recordedAtIso)),
    field('Acquisition started', `${localDateTime(session.startIso)} (= sample index 0)`),
    field('Duration', `${durationS.toFixed(3)} s (${minutesSeconds(durationS)})`),
    field('Channels', channels.map((c) => `${c.id.toUpperCase()} ${c.fs} Hz`).join(' · ')),
    field('Source', session.source),
    field('Source details', session.description),
    field('Markers', `${session.markers.length} (sheet Markers)`),
    ...Object.entries(session.settings).map(([name, value]) =>
      field(name, typeof value === 'number' ? value : String(value)),
    ),
    [],
    field('Data sheets', sheetNames.join(', ')),
  ]
  if (isSplit) {
    rows.push([
      null,
      {
        value:
          'Excel shows at most 1,048,576 rows per sheet: the data is split into sheets of whole minutes.',
      },
    ])
  }
  if (groupCount > 1) {
    rows.push([
      null,
      {
        value:
          'ECG and SCG have different sampling rates: each has its own sheets, on its own sample clock ' +
          '(never resampled).',
      },
    ])
  }
  rows.push(
    [],
    [{ value: 'Columns of the data sheets', style: STYLE.bold }],
    field('Time (s)', 'Seconds since Record was pressed (the first recorded sample is 0).'),
    ...channels.map((channel) =>
      field(
        `${channel.id.toUpperCase()} (V)`,
        `${channel.id.toUpperCase()} in volts exactly as received: not filtered, not resampled. ` +
          'Empty cell = missing sample.',
      ),
    ),
    field(
      'Marker',
      `Name of the marker placed on that sample (yellow row). Several markers on one sample: "a${MARKER_SEPARATOR}b".`,
    ),
    field(
      'Sample index',
      'Sample number since the acquisition started (Start), at the sampling rate of that sheet. ' +
        'On the Markers sheet: on the channel with the highest sampling rate (ECG if equal).',
    ),
    [],
    field('Python / MATLAB', 'Use the CSV export: the same values, easier to read with code.'),
  )
  return smallSheet({ columnWidths: [22, 110], freezeHeader: false, selected: true }, rows)
}
