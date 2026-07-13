import { test, expect } from '@playwright/test'
import {
  adminPass,
  adminUser,
  apiBase,
  apiLogin,
  loginAs,
  loginAsAdmin,
} from '../helpers/auth.js'

test.describe('permissions', () => {
  test('unauthenticated user is redirected to login', async ({ page }) => {
    await page.goto('/candidates')
    await expect(page).toHaveURL(/\/login/)

    await page.goto('/import')
    await expect(page).toHaveURL(/\/login/)
  })

  test('operator cannot open admin-only import page', async ({ page, request }) => {
    const stamp = Date.now()
    const username = `e2e_op_${stamp}`
    const tempPass = 'TempPass1!'
    const finalPass = 'OperPass1!'

    const admin = await apiLogin(request, adminUser, adminPass)

    const create = await request.post(`${apiBase()}/users`, {
      headers: {
        Authorization: `Bearer ${admin.token}`,
        'X-CSRF-Token': admin.csrf_token,
      },
      data: {
        username,
        password: tempPass,
        full_name: 'E2E Operator',
        role: 'operator',
      },
    })
    expect(create.status(), await create.text()).toBe(201)

    // First login forces password change
    const first = await apiLogin(request, username, tempPass)
    expect(first.user.must_change_password).toBeTruthy()

    const changed = await request.post(`${apiBase()}/auth/change-password`, {
      headers: {
        Authorization: `Bearer ${first.token}`,
        'X-CSRF-Token': first.csrf_token,
      },
      data: {
        current_password: tempPass,
        new_password: finalPass,
      },
    })
    expect(changed.ok(), await changed.text()).toBeTruthy()

    await loginAs(page, username, finalPass)
    await page.waitForURL('**/dashboard')

    await page.goto('/import')
    await expect(page).toHaveURL(/\/dashboard/)
    await expect(page.getByRole('heading', { name: 'นำเข้าข้อมูลบุคลากร' })).toHaveCount(0)
  })

  test('admin retains access to import', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/import')
    await expect(page).toHaveURL(/\/import/)
    await expect(page.getByRole('heading', { name: 'นำเข้าข้อมูลบุคลากร' })).toBeVisible()
  })
})
