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

  test('top5 and level table use the same near-window badge label when present', async ({ page }) => {
    // Stub overview + one level list so a mid-window person (45 days) is NEAR_MET everywhere.
    const nearPerson = {
      personnel_id: 99,
      full_name: 'ทดสอบ ใกล้เกณฑ์',
      current_position: 'นักวิชาการ',
      current_level_code: 'K2',
      current_level_name: 'ชำนาญการ',
      level_start_date_thai: '1 ม.ค. 2566',
      qualification_date_thai: '1 เม.ย. 2569',
      remaining_days: 45,
      status: 'not_yet',
      department: 'กองทดสอบ',
      supportive_days: 0,
      equivalence_days: 0,
      diverse_status: null,
      target_level: 'K3',
    }

    await page.route('**/api/candidates/overview**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          summary: { near_qualified_total: 1, qualified_total: 0, not_yet_total: 0, check_data_total: 0 },
          by_level: { K3: { total: 1, near_qualified: 1, qualified: 0, not_yet: 0, check_data: 0 } },
          top5: [nearPerson],
        }),
      })
    })

    await page.route('**/api/candidates/K3**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: [nearPerson],
          summary: {},
          pagination: { total: 1, limit: 20, offset: 0 },
        }),
      })
    })

    await page.goto('/candidates')
    await expect(page.getByText('ใกล้ถึงเกณฑ์').first()).toBeVisible()

    // Open K3 level list if the overview links/tabs expose it
    const k3Link = page.getByRole('link', { name: /K3|ชำนาญการพิเศษ|ระดับ.*K3/i }).first()
    if (await k3Link.count()) {
      await k3Link.click()
      await expect(page.getByText('ใกล้ถึงเกณฑ์').first()).toBeVisible()
      await expect(page.getByText('ทดสอบ ใกล้เกณฑ์')).toBeVisible()
    }
  })
})
