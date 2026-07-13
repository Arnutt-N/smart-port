import { test, expect } from '@playwright/test'
import { loginAsAdmin } from '../helpers/auth.js'

test.describe('import (admin)', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  test('admin can open import page and see template step', async ({ page }) => {
    await page.goto('/import')
    await expect(page).toHaveURL(/\/import/)
    await expect(page.getByRole('heading', { name: 'นำเข้าข้อมูลบุคลากร' })).toBeVisible()
    await expect(page.getByRole('link', { name: /ดาวน์โหลดเทมเพลต/ })).toBeVisible()
    await expect(page.getByText('2. อัปโหลดไฟล์')).toBeVisible()
  })
})
