import { test, expect } from '@playwright/test'
import { loginAsAdmin } from '../helpers/auth.js'

test.describe('probation-end', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  test('probation tracking page loads summary UI', async ({ page }) => {
    await page.goto('/probation-end')
    await expect(page).toHaveURL(/\/probation-end/)
    await expect(
      page.getByRole('heading', { name: 'ติดตามพ้นทดลองปฏิบัติราชการ' }),
    ).toBeVisible()
    await expect(page.locator('body')).toContainText(/ทั้งหมด|ใกล้ครบกำหนด|เกินกำหนด|กำลังดำเนินการ/)
  })
})
