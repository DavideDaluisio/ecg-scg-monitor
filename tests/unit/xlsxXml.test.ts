import { describe, expect, it } from 'vitest'
import {
  columnLetter,
  escapeXml,
  numberCell,
  rowXml,
  sheetStart,
  STYLE,
  textCell,
  workbookFiles,
} from '../../src/io/xlsxXml.ts'

describe('columnLetter', () => {
  it('counts A…Z, then AA, AB…', () => {
    expect([0, 1, 25, 26, 27, 51, 52, 701, 702].map(columnLetter)).toEqual([
      'A',
      'B',
      'Z',
      'AA',
      'AB',
      'AZ',
      'BA',
      'ZZ',
      'AAA',
    ])
  })
})

describe('escapeXml', () => {
  it('escapes the XML special characters and drops the control characters XML forbids', () => {
    expect(escapeXml('a < b & "c" > d')).toBe('a &lt; b &amp; &quot;c&quot; &gt; d')
    expect(escapeXml('bell\u0007 tab\t')).toBe('bell tab\t')
    expect(escapeXml('stand up · è')).toBe('stand up · è')
  })
})

describe('cells and rows', () => {
  it('writes a number as is, with its cell reference and style', () => {
    expect(numberCell('B', 2, '-6.5e-12')).toBe('<c r="B2"><v>-6.5e-12</v></c>')
    expect(numberCell('A', 3, '0.000333', STYLE.seconds)).toBe(
      '<c r="A3" s="2"><v>0.000333</v></c>',
    )
  })

  it('leaves an empty cell out, unless it has a style (the yellow of a marked row)', () => {
    expect(numberCell('C', 4, '')).toBe('')
    expect(numberCell('C', 4, '', STYLE.marked)).toBe('<c r="C4" s="3"/>')
    expect(textCell('D', 4, '')).toBe('')
  })

  it('writes text inside the cell, escaped', () => {
    expect(textCell('D', 5, 'rest & <talk>', STYLE.marked)).toBe(
      '<c r="D5" s="3" t="inlineStr"><is><t xml:space="preserve">rest &amp; &lt;talk&gt;</t></is></c>',
    )
  })

  it('writes a row of a small sheet, skipping empty cells', () => {
    expect(rowXml(7, [{ value: 'Session', style: STYLE.bold }, null, { value: 72 }])).toBe(
      '<row r="7"><c r="A7" s="5" t="inlineStr"><is><t xml:space="preserve">Session</t></is></c>' +
        '<c r="C7"><v>72</v></c></row>',
    )
  })
})

describe('sheetStart', () => {
  it('freezes the header row and sets the column widths, in the order Excel wants', () => {
    const xml = sheetStart({ columnWidths: [12, 15], freezeHeader: true, selected: false })
    expect(xml).toContain(
      '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>',
    )
    expect(xml).toContain(
      '<cols><col min="1" max="1" width="12" customWidth="1"/>' +
        '<col min="2" max="2" width="15" customWidth="1"/></cols>',
    )
    expect(xml.indexOf('<sheetViews>')).toBeLessThan(xml.indexOf('<cols>'))
    expect(xml.endsWith('<sheetData>')).toBe(true)
    expect(xml).not.toContain('tabSelected')
  })

  it('has no pane when the header is not frozen, and marks the selected sheet', () => {
    const xml = sheetStart({ columnWidths: [10], freezeHeader: false, selected: true })
    expect(xml).not.toContain('<pane')
    expect(xml).toContain('<sheetView workbookViewId="0" tabSelected="1">')
  })
})

describe('workbookFiles', () => {
  it('lists every sheet in the content types, the workbook and its relations', () => {
    const files = workbookFiles(['Info', 'Data 0-5 min'])
    const text = (path: string) => [...files.find((f) => f.path === path)!.parts].join('')
    expect(files.map((f) => f.path)).toEqual([
      '[Content_Types].xml',
      '_rels/.rels',
      'xl/workbook.xml',
      'xl/_rels/workbook.xml.rels',
      'xl/styles.xml',
    ])
    expect(text('[Content_Types].xml')).toContain('PartName="/xl/worksheets/sheet2.xml"')
    expect(text('xl/workbook.xml')).toContain(
      '<sheet name="Data 0-5 min" sheetId="2" r:id="rId2"/>',
    )
    expect(text('xl/_rels/workbook.xml.rels')).toContain('Id="rId3"')
    expect(text('xl/_rels/workbook.xml.rels')).toContain('Target="styles.xml"')
    expect(text('xl/styles.xml')).toContain('<cellXfs count="7">')
  })
})
