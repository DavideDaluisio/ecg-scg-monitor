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

  await page.goto('./')
  const picker = page.getByRole('combobox', { name: 'Recording' })
  await expect(picker).toHaveValue('ecg_synthetic_demo')

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
