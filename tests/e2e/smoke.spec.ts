import { fileURLToPath } from 'node:url'
import { expect, test, type Page } from '@playwright/test'

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
  await expect(page.getByRole('combobox', { name: 'ECG recording' })).toHaveValue(
    'ecg_synthetic_demo',
  )
  // The production build never asks for real recordings (samples/local/ is not deployed).
  expect(requests.filter((url) => url.includes('/samples/local/'))).toEqual([])
  await page.getByRole('combobox', { name: 'SCG recording' }).selectOption('')

  await page.getByRole('button', { name: 'Start' }).click()
  await expect(page.getByTestId('status-badge')).toHaveText('running')
  await expect(
    page.getByText('ecg_synthetic_demo · 3000 Hz · 30,000 samples (10.0 s)'),
  ).toBeVisible()
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
  await page.getByRole('combobox', { name: 'ECG recording' }).selectOption('')
  await expect(page.getByRole('combobox', { name: 'SCG recording' })).toHaveValue(
    'scg_synthetic_demo',
  )

  await page.getByRole('button', { name: 'Start' }).click()
  await expect(page.getByTestId('status-badge')).toHaveText('running')
  await expect(
    page.getByText('scg_synthetic_demo · 3000 Hz · 30,000 samples (10.0 s)'),
  ).toBeVisible()
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
  await expect(page.getByText('ecg_synthetic_demo · 3000 Hz')).toBeVisible()
  await expect(page.getByText('scg_synthetic_demo · 3000 Hz')).toBeVisible()
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
  await page
    .getByLabel('Open SCG file…')
    .setInputFiles(fileURLToPath(new URL('../fixtures/scg_synthetic.csv', import.meta.url)))
  const scgPicker = page.getByRole('combobox', { name: 'SCG recording' })
  await expect(scgPicker.locator('option:checked')).toHaveText('scg_synthetic.csv (from disk)')

  await page.getByRole('button', { name: 'Start' }).click()
  await expect(page.getByTestId('status-badge')).toHaveText('running')
  await expect(page.getByText('scg_synthetic.csv · 3000 Hz · 6,000 samples (2.0 s)')).toBeVisible()
  await expect(page.getByTestId('plot-scg').locator('canvas')).toBeVisible()
  await expect(page.getByTestId('plot-ecg').locator('canvas')).toBeVisible()
  await expect(page.getByTestId('not-simultaneous')).toContainText('Not simultaneous')

  await page.getByRole('button', { name: 'Stop' }).click()
  expect(errors).toEqual([])
})

// M3: synthetic ECG + SCG with a chosen delay; Pause freezes both panels; the cursor crosses both panels.
test('synthetic ECG + SCG: synchronized pause and cursor', async ({ page }) => {
  const errors = watchErrors(page)

  await page.goto('./')
  await page.getByRole('combobox', { name: 'Source' }).selectOption('synthetic')
  await page.getByRole('spinbutton', { name: 'R→AO (ms)' }).fill('100')
  await page.getByRole('combobox', { name: 'ECG fs' }).selectOption('500')

  await page.getByRole('button', { name: 'Start' }).click()
  await expect(page.getByTestId('status-badge')).toHaveText('running')
  await expect(
    page.getByText('Synthetic ECG + SCG · 72 bpm · R→AO 100 ms · ECG 500 Hz · SCG 3000 Hz'),
  ).toBeVisible()
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
