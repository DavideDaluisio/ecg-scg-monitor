// The XML files inside an .xlsx workbook (Office Open XML), written as plain text. An .xlsx is a zip of these files
// (zip.ts). Only what the Excel export needs: text written in the cell itself (no shared-string table), a few cell
// styles, a frozen header row and column widths. Format of the export: docs/data-formats.md, "Excel export".

/** One file of the workbook: its path inside the zip and its text, in parts (a big sheet is built while zipped). */
export interface XlsxEntry {
  path: string
  parts: Iterable<string>
}

/** The cell styles of styles.xml (the index of each `<xf>` in `<cellXfs>`). */
export const STYLE = {
  normal: 0,
  header: 1, // bold on a grey background
  seconds: 2, // number shown with 6 decimals (the value itself is not rounded by Excel)
  marked: 3, // yellow background: a row with a marker
  markedSeconds: 4, // yellow background, 6 decimals
  bold: 5,
  title: 6, // bold, larger
} as const

/** A cell of a small sheet (Info, Markers, header rows). `null` = an empty cell. */
export interface XlsxCell {
  value: number | string | null
  style?: number
}

/** Options of one sheet. */
export interface SheetOptions {
  columnWidths: number[] // in characters, one per column from A
  freezeHeader: boolean // the first row stays visible while scrolling
  selected: boolean // the sheet shown when the file is opened (one per workbook)
}

const XML_HEADER = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
const MAIN_NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
const REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const PACKAGE_REL_NS = 'http://schemas.openxmlformats.org/package/2006/relationships'
const SHEET_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml'

/** The end of every sheet started with `sheetStart()`. */
export const SHEET_END = '</sheetData></worksheet>'

/** Column letter of a 0-based column number: 0 → "A", 25 → "Z", 26 → "AA". */
export function columnLetter(column: number): string {
  let letters = ''
  let n = column + 1
  while (n > 0) {
    const remainder = (n - 1) % 26
    letters = String.fromCharCode(65 + remainder) + letters
    n = Math.floor((n - 1) / 26)
  }
  return letters
}

/**
 * Text that can go inside an XML element or attribute: & < > " escaped, and the control characters that XML does
 * not allow (e.g. a pasted tab is allowed, a bell character is not) removed.
 */
export function escapeXml(text: string): string {
  return (
    text
      // oxlint-disable-next-line no-control-regex -- on purpose: these are the characters XML 1.0 forbids
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  )
}

/**
 * A number cell. `text` is the number as text ("0.000333", "-6.5e-12"): written as is, so Excel stores exactly the
 * value the export chose. An empty text gives an empty cell, which keeps its style (the yellow of a marked row).
 */
export function numberCell(column: string, row: number, text: string, style = 0): string {
  const styleAttribute = style === 0 ? '' : ` s="${style}"`
  if (text === '') return style === 0 ? '' : `<c r="${column}${row}"${styleAttribute}/>`
  return `<c r="${column}${row}"${styleAttribute}><v>${text}</v></c>`
}

/** A text cell (an "inline string": the text is in the cell, not in a shared table). Empty text = empty cell. */
export function textCell(column: string, row: number, text: string, style = 0): string {
  if (text === '') return numberCell(column, row, '', style)
  const styleAttribute = style === 0 ? '' : ` s="${style}"`
  return (
    `<c r="${column}${row}"${styleAttribute} t="inlineStr">` +
    `<is><t xml:space="preserve">${escapeXml(text)}</t></is></c>`
  )
}

/** One row of a small sheet. `row` is the Excel row number (from 1). */
export function rowXml(row: number, cells: readonly (XlsxCell | null)[]): string {
  let xml = `<row r="${row}">`
  cells.forEach((cell, column) => {
    if (cell === null || cell.value === null) return
    const letter = columnLetter(column)
    xml +=
      typeof cell.value === 'number'
        ? numberCell(letter, row, String(cell.value), cell.style)
        : textCell(letter, row, cell.value, cell.style)
  })
  return xml + '</row>'
}

/** Everything a sheet has before its rows. The rows follow, then `SHEET_END`. */
export function sheetStart(options: SheetOptions): string {
  const selected = options.selected ? ' tabSelected="1"' : ''
  const pane = options.freezeHeader
    ? '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>' +
      '<selection pane="bottomLeft" activeCell="A2" sqref="A2"/>'
    : ''
  const columns = options.columnWidths
    .map((width, i) => `<col min="${i + 1}" max="${i + 1}" width="${width}" customWidth="1"/>`)
    .join('')
  // Excel wants the parts of a sheet in this order: sheetViews, cols, sheetData.
  return (
    `${XML_HEADER}<worksheet xmlns="${MAIN_NS}">` +
    `<sheetViews><sheetView workbookViewId="0"${selected}>${pane}</sheetView></sheetViews>` +
    `<cols>${columns}</cols><sheetData>`
  )
}

/** A whole small sheet in one text. */
export function smallSheet(options: SheetOptions, rows: readonly (XlsxCell | null)[][]): string {
  return sheetStart(options) + rows.map((cells, i) => rowXml(i + 1, cells)).join('') + SHEET_END
}

/**
 * The files every workbook needs besides its sheets: the list of the files and their types, the workbook (names and
 * order of the sheets), the links between them, and the cell styles. The sheets must be stored as
 * `xl/worksheets/sheet1.xml`, `sheet2.xml`… in the order of `sheetNames`.
 */
export function workbookFiles(sheetNames: readonly string[]): XlsxEntry[] {
  const sheetNumbers = sheetNames.map((_, i) => i + 1)
  const contentTypes =
    `${XML_HEADER}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ' +
    'ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    '<Override PartName="/xl/styles.xml" ' +
    'ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
    sheetNumbers
      .map((n) => `<Override PartName="/xl/worksheets/sheet${n}.xml" ContentType="${SHEET_TYPE}"/>`)
      .join('') +
    '</Types>'
  const rootRelations =
    `${XML_HEADER}<Relationships xmlns="${PACKAGE_REL_NS}">` +
    `<Relationship Id="rId1" Type="${REL_NS}/officeDocument" Target="xl/workbook.xml"/>` +
    '</Relationships>'
  const workbook =
    `${XML_HEADER}<workbook xmlns="${MAIN_NS}" xmlns:r="${REL_NS}"><sheets>` +
    sheetNames
      .map((name, i) => `<sheet name="${escapeXml(name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
      .join('') +
    '</sheets></workbook>'
  const workbookRelations =
    `${XML_HEADER}<Relationships xmlns="${PACKAGE_REL_NS}">` +
    sheetNumbers
      .map(
        (n) =>
          `<Relationship Id="rId${n}" Type="${REL_NS}/worksheet" Target="worksheets/sheet${n}.xml"/>`,
      )
      .join('') +
    `<Relationship Id="rId${sheetNames.length + 1}" Type="${REL_NS}/styles" Target="styles.xml"/>` +
    '</Relationships>'

  return [
    { path: '[Content_Types].xml', parts: [contentTypes] },
    { path: '_rels/.rels', parts: [rootRelations] },
    { path: 'xl/workbook.xml', parts: [workbook] },
    { path: 'xl/_rels/workbook.xml.rels', parts: [workbookRelations] },
    { path: 'xl/styles.xml', parts: [STYLES] },
  ]
}

// Fonts: 0 normal, 1 bold, 2 bold and larger. Fills: 0 and 1 are required by Excel, 2 grey, 3 light yellow.
// Number format 164 = 6 decimals. The order of <xf> in <cellXfs> is the STYLE numbers above.
const STYLES =
  `${XML_HEADER}<styleSheet xmlns="${MAIN_NS}">` +
  '<numFmts count="1"><numFmt numFmtId="164" formatCode="0.000000"/></numFmts>' +
  '<fonts count="3">' +
  '<font><sz val="11"/><name val="Calibri"/><family val="2"/></font>' +
  '<font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font>' +
  '<font><b/><sz val="14"/><name val="Calibri"/><family val="2"/></font>' +
  '</fonts>' +
  '<fills count="4">' +
  '<fill><patternFill patternType="none"/></fill>' +
  '<fill><patternFill patternType="gray125"/></fill>' +
  '<fill><patternFill patternType="solid"><fgColor rgb="FFE5E7EB"/><bgColor indexed="64"/></patternFill></fill>' +
  '<fill><patternFill patternType="solid"><fgColor rgb="FFFFF2CC"/><bgColor indexed="64"/></patternFill></fill>' +
  '</fills>' +
  '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  '<cellXfs count="7">' +
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
  '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>' +
  '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
  '<xf numFmtId="0" fontId="0" fillId="3" borderId="0" xfId="0" applyFill="1"/>' +
  '<xf numFmtId="164" fontId="0" fillId="3" borderId="0" xfId="0" applyNumberFormat="1" applyFill="1"/>' +
  '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
  '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
  '</cellXfs>' +
  '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
  '</styleSheet>'
