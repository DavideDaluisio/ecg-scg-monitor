import { expect, test } from '@playwright/test'

// M0: the app shell loads. From M1 this test also starts a replay and checks the status becomes "running".
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
