import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'

test('app shell loads with ECG and SCG panels', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))

  await page.goto('./')

  await expect(page.getByRole('heading', { name: 'ECG/SCG Monitor' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'ECG panel' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'SCG panel' })).toBeVisible()
  await expect(page.getByTestId('status-badge')).toHaveText('idle')
  expect(errors).toEqual([])
})

// M1: the synthetic demo (the only recording on the public site) replays live in the ECG panel.
test('replays the synthetic ECG demo', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  const requests: string[] = []
  page.on('request', (request) => requests.push(request.url()))

  await page.goto('./')
  const picker = page.getByRole('combobox', { name: 'Recording' })
  await expect(picker).toHaveValue('ecg_synthetic_demo')
  // The production build never asks for real recordings (samples/local/ is not deployed).
  expect(requests.filter((url) => url.includes('/samples/local/'))).toEqual([])

  await page.getByRole('button', { name: 'Start' }).click()
  await expect(page.getByTestId('status-badge')).toHaveText('running')
  await expect(page.getByText('ecg_synthetic_demo · 3000 Hz · 30,000 samples (10.0 s)')).toBeVisible()
  await expect(page.getByTestId('plot-ecg').locator('canvas')).toBeVisible()
  await page.waitForTimeout(1000) // let the trace scroll for a moment

  await page.getByRole('button', { name: 'Pause' }).click()
  await expect(page.getByRole('button', { name: 'Resume' })).toBeVisible()
  await expect(page.getByTestId('status-badge')).toHaveText('running') // pause = display only

  await page.getByRole('button', { name: 'Stop' }).click()
  await expect(page.getByTestId('status-badge')).toHaveText('idle')
  expect(errors).toEqual([])
})

// M2: the synthetic SCG demo replays live in the SCG panel; the ECG panel shows a placeholder.
test('replays the synthetic SCG demo', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })

  await page.goto('./')
  const picker = page.getByRole('combobox', { name: 'Recording' })
  await expect(picker).toHaveValue('ecg_synthetic_demo') // ECG stays the default
  await picker.selectOption('scg_synthetic_demo')

  await page.getByRole('button', { name: 'Start' }).click()
  await expect(page.getByTestId('status-badge')).toHaveText('running')
  await expect(page.getByText('scg_synthetic_demo · 3000 Hz · 30,000 samples (10.0 s)')).toBeVisible()
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

// M2: a CSV opened from disk with "Open SCG file…" goes to the SCG panel.
test('opens an SCG CSV file from disk', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))

  await page.goto('./')
  await page
    .getByLabel('Open SCG file…')
    .setInputFiles(fileURLToPath(new URL('../fixtures/scg_synthetic.csv', import.meta.url)))
  const picker = page.getByRole('combobox', { name: 'Recording' })
  await expect(picker.locator('option:checked')).toHaveText('scg_synthetic.csv (SCG, from disk)')

  await page.getByRole('button', { name: 'Start' }).click()
  await expect(page.getByTestId('status-badge')).toHaveText('running')
  await expect(page.getByText('scg_synthetic.csv · 3000 Hz · 6,000 samples (2.0 s)')).toBeVisible()
  await expect(page.getByTestId('plot-scg').locator('canvas')).toBeVisible()

  await page.getByRole('button', { name: 'Stop' }).click()
  expect(errors).toEqual([])
})
