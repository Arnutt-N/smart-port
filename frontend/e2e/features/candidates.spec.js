import { test, expect } from '@playwright/test'
import { loginAsAdmin } from '../helpers/auth.js'

test.describe('candidates', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  test('overview page loads summary UI', async ({ page }) => {
    await page.goto('/candidates')
    await expect(page).toHaveURL(/\/candidates/)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    // Overview stats cards / section should render after API
    await expect(page.locator('body')).toContainText(/บัญชีรายชื่อ|ภาพรวม|คุณสมบัติ/)
  })
})
