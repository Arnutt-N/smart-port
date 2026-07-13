import { test, expect } from '@playwright/test'
import { adminPass, adminUser, loginAs, loginAsAdmin } from '../helpers/auth.js'

test.describe('login', () => {
  test('rejects invalid credentials', async ({ page }) => {
    await loginAs(page, adminUser, 'wrong-password-xxx')
    await expect(page.getByText('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง')).toBeVisible()
    await expect(page).toHaveURL(/\/login/)
  })

  test('admin can sign in and reach dashboard', async ({ page }) => {
    await loginAsAdmin(page)
    await expect(page).toHaveURL(/\/dashboard/)
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()
  })
})
