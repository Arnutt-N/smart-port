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

  test('uploading a fake xlsx shows failure panel without importing', async ({ page }) => {
    await page.goto('/import')

    // ตั้งชื่อ .xlsx ผ่าน client validation (ImportPage pick()) แต่ magic bytes ไม่ใช่ zip
    // → backend ปฏิเสธที่ routes/import.php:81-93 (415 ไฟล์ไม่ใช่ .xlsx ที่ถูกต้อง) ก่อนแตะ import logic
    await page.locator('#import-file-input').setInputFiles({
      name: 'e2e-fake-excel.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: Buffer.from('definitely not a zip file'),
    })

    await page.getByRole('button', { name: 'นำเข้าข้อมูล' }).click()

    // แผงผลลัพธ์ (aria-live) แสดง error จาก backend ไม่ใช่แค่ client-side validation
    await expect(page.getByText('นำเข้าไม่สำเร็จ', { exact: false })).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText('ไฟล์ไม่ใช่ .xlsx ที่ถูกต้อง')).toBeVisible()
  })
})
