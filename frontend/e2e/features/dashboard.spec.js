import { test, expect } from '@playwright/test'
import { loginAsAdmin } from '../helpers/auth.js'

test.describe('dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  test('overview page loads heading and refresh control', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/\/dashboard/)
    await expect(page.getByRole('heading', { name: 'ภาพรวมระบบสมุดพก' })).toBeVisible()
    await expect(page.getByRole('button', { name: /รีเฟรช/ })).toBeVisible()
    await expect(page.locator('body')).toContainText(/ข้าราชการ|พ้นทดลอง|คุณสมบัติ/)
  })
})
