import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { expect, test, type Page } from '@playwright/test'
import * as XLSX from 'xlsx'

const BOM = String.fromCharCode(0xfeff) // byte-order mark at the start of every CSV export

// Collects page errors and console errors: every test ends by checking that there were none.
function watchErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  return errors
}

// Reads "t = 1.2345 s · …" from the cursor readout of one panel.
async function readCursorTime(page: Page, channel: string): Promise<number> {
  const readout = page.getByTestId(`plot-${channel}`).getByTestId('cursor-readout')
  await expect(readout).toHaveText(/^t = \d+\.\d{4} s/)
  return Number((await readout.textContent())!.match(/t = ([\d.]+) s/)![1])
}

// The source settings are in a panel under the top bar, closed by default and closed again by Start.
async function openSourcePanel(page: Page): Promise<void> {
  const button = page.getByRole('button', { name: 'Source settings' })
  if ((await button.getAttribute('aria-expanded')) !== 'true') await button.click()
}

// What is playing ("name · fs · samples") is in the tooltip of the source button, not in a line of its own.
async function expectSourceInfo(page: Page, text: string): Promise<void> {
  const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  await expect(page.getByRole('button', { name: 'Source settings' })).toHaveAttribute(
    'title',
    new RegExp(escaped),
  )
}

test('app shell loads with ECG and SCG panels', async ({ page }) => {
  const errors = watchErrors(page)

  await page.goto('./')

  await expect(page.getByRole('heading', { name: 'ECG/SCG Monitor' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'ECG panel' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'SCG panel' })).toBeVisible()
  await expect(page.getByTestId('status-badge')).toHaveText('idle')
  expect(errors).toEqual([])
})

// M1: the synthetic ECG demo replays alone in the ECG panel.
test('replays the synthetic ECG demo', async ({ page }) => {
  const errors = watchErrors(page)
  const requests: string[] = []
  page.on('request', (request) => requests.push(request.url()))

  await page.goto('./')
  await openSourcePanel(page)
  await expect(page.getByRole('combobox', { name: 'ECG recording' })).toHaveValue(
    'ecg_synthetic_demo',
  )
  // The production build never asks for real recordings (samples/local/ is not deployed).
  expect(requests.filter((url) => url.includes('/samples/local/'))).toEqual([])
  await page.getByRole('combobox', { name: 'SCG recording' }).selectOption('')

  await page.getByRole('button', { name: 'Start' }).click()
  await expect(page.getByTestId('status-badge')).toHaveText('running')
  await expectSourceInfo(page, 'ecg_synthetic_demo · 3000 Hz · 30,000 samples (10.0 s)')
  await expect(page.getByTestId('plot-ecg').locator('canvas')).toBeVisible()
  await expect(page.getByTestId('placeholder-scg')).toHaveText('No SCG signal in this recording')
  await page.waitForTimeout(1000) // let the trace scroll for a moment

  await page.getByRole('button', { name: 'Pause' }).click()
  await expect(page.getByRole('button', { name: 'Resume' })).toBeVisible()
  await expect(page.getByTestId('status-badge')).toHaveText('running') // pause = display only

  await page.getByRole('button', { name: 'Stop' }).click()
  await expect(page.getByTestId('status-badge')).toHaveText('idle')
  expect(errors).toEqual([])
})

// M2: the synthetic SCG demo replays alone in the SCG panel; the ECG panel shows a placeholder.
test('replays the synthetic SCG demo', async ({ page }) => {
  const errors = watchErrors(page)

  await page.goto('./')
  await openSourcePanel(page)
  await page.getByRole('combobox', { name: 'ECG recording' }).selectOption('')
  await expect(page.getByRole('combobox', { name: 'SCG recording' })).toHaveValue(
    'scg_synthetic_demo',
  )

  await page.getByRole('button', { name: 'Start' }).click()
  await expect(page.getByTestId('status-badge')).toHaveText('running')
  await expectSourceInfo(page, 'scg_synthetic_demo · 3000 Hz · 30,000 samples (10.0 s)')
  await expect(page.getByTestId('plot-scg').locator('canvas')).toBeVisible()
  await expect(page.getByTestId('placeholder-ecg')).toHaveText('No ECG signal in this recording')
  await expect(page.getByTestId('plot-ecg')).toHaveCount(0)
  await page.waitForTimeout(1000) // let the trace scroll for a moment

  await page.getByRole('button', { name: 'Stop' }).click()
  await expect(page.getByTestId('status-badge')).toHaveText('idle')
  // Stop keeps the last frame on screen.
  await expect(page.getByTestId('plot-scg').locator('canvas')).toBeVisible()
  expect(errors).toEqual([])
})

// M3: by default the two demos (generated together, so simultaneous) play together, one panel each.
test('replays the ECG and SCG demos together', async ({ page }) => {
  const errors = watchErrors(page)

  await page.goto('./')
  await page.getByRole('button', { name: 'Start' }).click()
  await expect(page.getByTestId('status-badge')).toHaveText('running')
  await expectSourceInfo(page, 'ecg_synthetic_demo · 3000 Hz')
  await expectSourceInfo(page, 'scg_synthetic_demo · 3000 Hz')
  await expect(page.getByTestId('plot-ecg').locator('canvas')).toBeVisible()
  await expect(page.getByTestId('plot-scg').locator('canvas')).toBeVisible()
  await expect(page.getByTestId('not-simultaneous')).toHaveCount(0)

  await page.getByRole('button', { name: 'Stop' }).click()
  expect(errors).toEqual([])
})

// M2/M3: a CSV opened with "Open SCG file…" plays in the SCG panel, next to the ECG demo. Nothing says when the
// file was recorded, so the pair is labeled "not simultaneous".
test('opens an SCG CSV file from disk and plays it with the ECG demo', async ({ page }) => {
  const errors = watchErrors(page)

  await page.goto('./')
  await openSourcePanel(page)
  await page
    .getByLabel('Open SCG file…')
    .setInputFiles(fileURLToPath(new URL('../fixtures/scg_synthetic.csv', import.meta.url)))
  const scgPicker = page.getByRole('combobox', { name: 'SCG recording' })
  await expect(scgPicker.locator('option:checked')).toHaveText('scg_synthetic.csv (from disk)')

  await page.getByRole('button', { name: 'Start' }).click()
  await expect(page.getByTestId('status-badge')).toHaveText('running')
  await expectSourceInfo(page, 'scg_synthetic.csv · 3000 Hz · 6,000 samples (2.0 s)')
  await expect(page.getByTestId('plot-scg').locator('canvas')).toBeVisible()
  await expect(page.getByTestId('plot-ecg').locator('canvas')).toBeVisible()
  await expect(page.getByTestId('not-simultaneous')).toContainText('Not simultaneous')

  await page.getByRole('button', { name: 'Stop' }).click()
  expect(errors).toEqual([])
})

// The lab's newer LabVIEW files hold 4 channels: ECG is column B, SCG column D. Opened twice from disk, one column
// per channel. Two columns of the same file were recorded together: no "not simultaneous" note.
test('opens a 4-channel LVM file from disk: ECG from column B, SCG from column D', async ({
  page,
}) => {
  const errors = watchErrors(page)
  const file = fileURLToPath(new URL('../fixtures/ecg_scg_synthetic_4ch.lvm', import.meta.url))

  await page.goto('./')
  await openSourcePanel(page)
  await page.getByLabel('Open ECG file…').setInputFiles(file)
  await page.getByLabel('Open SCG file…').setInputFiles(file)
  const ecgColumn = page.getByRole('combobox', { name: 'ECG column' })
  const scgColumn = page.getByRole('combobox', { name: 'SCG column' })
  await expect(ecgColumn.locator('option')).toHaveText([
    'Choose…',
    'B · Voltage_0',
    'D · Voltage_1 (Filtered)',
    'F · Voltage_2',
    'H · Voltage_3',
  ])

  // No guessed column: Start without a choice explains what to do.
  await page.getByRole('button', { name: 'Start' }).click()
  await expect(page.getByRole('alert')).toContainText('4 signals')
  await expect(page.getByRole('alert')).toContainText('choose a column')

  await openSourcePanel(page) // Start closed it
  await ecgColumn.selectOption('B')
  await scgColumn.selectOption('D')
  await page.getByRole('button', { name: 'Start' }).click()
  await expect(page.getByTestId('status-badge')).toHaveText('running')
  await expectSourceInfo(page, 'ecg_scg_synthetic_4ch.lvm column B · 3000 Hz')
  await expectSourceInfo(page, 'ecg_scg_synthetic_4ch.lvm column D · 3000 Hz')
  await expect(page.getByTestId('plot-ecg').locator('canvas')).toBeVisible()
  await expect(page.getByTestId('plot-scg').locator('canvas')).toBeVisible()
  await expect(page.getByTestId('not-simultaneous')).toHaveCount(0)

  await page.getByRole('button', { name: 'Stop' }).click()
  // The message of the first Start is shown in the page, not logged as an error.
  expect(errors).toEqual([])
})

// M3: synthetic ECG + SCG with a chosen delay; Pause freezes both panels; the cursor crosses both panels.
test('synthetic ECG + SCG: synchronized pause and cursor', async ({ page }) => {
  const errors = watchErrors(page)

  await page.goto('./')
  await openSourcePanel(page)
  await page.getByRole('combobox', { name: 'Source' }).selectOption('synthetic')
  await page.getByText('Advanced').click() // the synthetic settings are folded
  await page.getByRole('spinbutton', { name: 'R→AO (ms)' }).fill('100')
  await page.getByRole('combobox', { name: 'ECG fs' }).selectOption('500')

  await page.getByRole('button', { name: 'Start' }).click()
  await expect(page.getByTestId('status-badge')).toHaveText('running')
  await expectSourceInfo(
    page,
    'Synthetic ECG + SCG · 72 bpm · R→AO 100 ms · ECG 500 Hz · SCG 3000 Hz',
  )
  const ecgCanvas = page.getByTestId('plot-ecg').locator('canvas')
  const scgCanvas = page.getByTestId('plot-scg').locator('canvas')
  await expect(ecgCanvas).toBeVisible()
  await expect(scgCanvas).toBeVisible()
  await page.waitForTimeout(1500)

  // Pause freezes both panels at the same time, while the source keeps running.
  await page.getByRole('button', { name: 'Pause' }).click()
  await page.waitForTimeout(100) // the frame that was already being drawn
  const ecgFrozen = await ecgCanvas.screenshot()
  const scgFrozen = await scgCanvas.screenshot()
  await page.waitForTimeout(500)
  expect((await ecgCanvas.screenshot()).equals(ecgFrozen)).toBe(true)
  expect((await scgCanvas.screenshot()).equals(scgFrozen)).toBe(true)
  await expect(page.getByTestId('status-badge')).toHaveText('running')

  // The cursor over the ECG also appears on the SCG at the same time (one drawn point apart at most).
  await page.getByTestId('plot-ecg').hover()
  const ecgTime = await readCursorTime(page, 'ecg')
  const scgTime = await readCursorTime(page, 'scg')
  expect(Math.abs(ecgTime - scgTime)).toBeLessThan(0.02)

  await page.getByRole('button', { name: 'Resume' }).click()
  await page.getByRole('button', { name: 'Stop' }).click()
  await expect(page.getByTestId('status-badge')).toHaveText('idle')
  expect(errors).toEqual([])
})

// M4: record the synthetic source with markers of different types (presets and a name typed by the user), rename
// markers while recording and afterwards, export the saved session as Excel and CSV, delete it.
test('records markers of several types, renames them, exports Excel and CSV, deletes', async ({
  page,
}) => {
  const errors = watchErrors(page)
  page.on('dialog', (dialog) => void dialog.accept()) // the "Delete …?" confirmation

  await page.goto('./')
  await expect(page.getByText('No saved session yet')).toBeVisible()
  await openSourcePanel(page)
  await page.getByRole('combobox', { name: 'Source' }).selectOption('synthetic')
  await page.getByRole('button', { name: 'Start' }).click()
  await expect(page.getByTestId('status-badge')).toHaveText('running')
  // Markers only while recording: the marker row is not even shown before.
  await expect(page.getByRole('region', { name: 'Markers' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'stand up', exact: true })).toHaveCount(0)

  await page.getByRole('button', { name: 'Record', exact: true }).click()
  await expect(page.getByTestId('rec-timer')).toBeVisible()
  await page.waitForTimeout(500)
  // One click per preset, one after the other (the bug: after "stand up", only "stand up" could be added).
  await page.getByRole('button', { name: 'stand up', exact: true }).click()
  await page.waitForTimeout(200)
  await page.getByRole('button', { name: 'sit down', exact: true }).click()
  await page.waitForTimeout(200)
  // A name that has no button yet: "+", type it, Enter.
  await page.getByRole('button', { name: 'New marker name' }).click()
  const otherName = page.getByLabel('Other name')
  await otherName.fill('walking fast')
  await otherName.press('Enter')
  await expect(otherName).toHaveCount(0) // the field closes; "+" is back

  // The list of the recording's markers is folded behind "Markers (n)".
  await page.getByRole('button', { name: 'Markers (3)' }).click()
  const liveRows = page
    .getByRole('table', { name: 'Markers of this recording' })
    .getByTestId('marker-row')
  await expect(liveRows).toHaveCount(3)
  await expect(liveRows.nth(0)).toContainText('stand up')
  await expect(liveRows.nth(1)).toContainText('sit down')
  await expect(liveRows.nth(2)).toContainText('walking fast')
  // The typed name became a button: one click next time.
  await expect(page.getByRole('button', { name: 'walking fast', exact: true })).toBeEnabled()

  // Rename while recording.
  await page.getByRole('button', { name: 'Rename marker 2' }).click()
  await page.getByLabel('New name of marker 2').fill('sit down slowly')
  await page.getByLabel('New name of marker 2').press('Enter')
  await expect(liveRows.nth(1)).toContainText('sit down slowly')
  const samples: number[] = []
  for (let i = 0; i < 3; i++) {
    samples.push(Number(await liveRows.nth(i).getAttribute('data-sample-index')))
  }
  expect(samples[0]).toBeLessThan(samples[1])
  expect(samples[1]).toBeLessThan(samples[2])

  // A custom type can be removed (markers already placed keep their name). Only while recording: the marker row
  // exists only then.
  await page.getByRole('button', { name: 'Remove marker type walking fast' }).click()
  await expect(page.getByRole('button', { name: 'walking fast', exact: true })).toHaveCount(0)
  await expect(liveRows.nth(2)).toContainText('walking fast')

  // Pause freezes the display only: the recording goes on.
  await page.getByRole('button', { name: 'Pause' }).click()
  await page.waitForTimeout(1000)
  await page.getByRole('button', { name: 'Stop recording' }).click()
  await expect(liveRows).toHaveCount(0) // the list moves to Saved sessions

  const row = page.getByTestId('saved-session')
  await expect(row).toHaveCount(1)
  await expect(row).toContainText('ECG 3000 Hz · SCG 3000 Hz')
  await expect(row.getByRole('cell').nth(3)).toContainText('3') // markers
  await expect(row.getByRole('cell').nth(1)).toHaveText(/^00:0[1-4]$/) // ≈ 2 s, paused part included

  // Excel: Info, Markers and Data sheets; the markers with their (renamed) names on the right samples.
  const excelPromise = page.waitForEvent('download')
  await row.getByRole('button', { name: 'Export Excel' }).click()
  const excel = await excelPromise
  expect(excel.suggestedFilename()).toMatch(/^session_\d{4}-\d\d-\d\d_\d\d-\d\d-\d\d\.xlsx$/)
  const book = XLSX.read(await readFile(await excel.path()))
  expect(book.SheetNames).toEqual(['Info', 'Markers', 'Data'])
  const sheetRows = (name: string) =>
    XLSX.utils.sheet_to_json<(string | number | null)[]>(book.Sheets[name], {
      header: 1,
      defval: null,
    })
  const names = ['stand up', 'sit down slowly', 'walking fast']
  const markerSheet = sheetRows('Markers')
  expect(markerSheet[0]).toEqual(['#', 'Time (s)', 'Time (min:s)', 'Name', 'Sample index'])
  expect(markerSheet.slice(1).map((r) => r[3])).toEqual(names)
  expect(markerSheet.slice(1).map((r) => r[4])).toEqual(samples)
  const data = sheetRows('Data')
  expect(data[0]).toEqual(['Time (s)', 'ECG (V)', 'SCG (V)', 'Marker', 'Sample index'])
  expect(data[1][0]).toBe(0) // time starts at 0 at Record
  expect(typeof data[1][1]).toBe('number')
  const markedRows = data.slice(1).filter((r) => r[3] !== null)
  expect(markedRows.map((r) => [r[3], r[4]])).toEqual(names.map((name, i) => [name, samples[i]]))

  // CSV (for Python): same markers on the same samples.
  const csvPromise = page.waitForEvent('download')
  await row.getByRole('button', { name: 'Export CSV' }).click()
  const csv = await csvPromise
  expect(csv.suggestedFilename()).toMatch(/^session_\d{4}-\d\d-\d\d_\d\d-\d\d-\d\d\.csv$/)
  const text = await readFile(await csv.path(), 'utf8')
  // A byte-order mark first, so that Excel reads the file as UTF-8.
  expect(text.startsWith(`${BOM}# ECG/SCG Monitor export - format v2 - standard CSV`)).toBe(true)
  expect(text).toContain('\n# Sampling rate (Hz): 3000\n')
  expect(text).toContain('\n# synthetic_r_to_ao_ms: 80\n')
  // time_s starts at 0 at Record; sample_index stays the live one.
  expect(text).toMatch(/\nsample_index,time_s,ecg_V,scg_V,marker\n\d+,0\.000000,/)
  const csvMarkers = text
    .split('\n')
    .filter((line) => /^\d/.test(line) && !line.endsWith(','))
    .map((line) => [line.split(',').at(-1), Number(line.split(',')[0])])
  expect(csvMarkers).toEqual(names.map((name, i) => [name, samples[i]]))

  // Rename after the recording, from the saved session.
  await row.getByRole('button', { name: /^Markers of session_/ }).click()
  const savedRows = page
    .getByRole('table', { name: /^Markers of session_/ })
    .getByTestId('marker-row')
  await expect(savedRows).toHaveCount(3)
  await page.getByRole('button', { name: 'Rename marker 3' }).click()
  await page.getByLabel('New name of marker 3').fill('walking')
  await page.getByRole('button', { name: 'Save' }).click()
  // Read back from IndexedDB (the list is refreshed after the rename).
  await expect(savedRows.nth(2).getByRole('cell').nth(2)).toHaveText('walking')

  await row.getByRole('button', { name: 'Delete' }).click()
  await expect(page.getByTestId('saved-session')).toHaveCount(0)
  await page.getByRole('button', { name: 'Resume' }).click()
  await page.getByRole('button', { name: 'Stop', exact: true }).click()
  expect(errors).toEqual([])
})
