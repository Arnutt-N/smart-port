import { test, expect } from '@playwright/test'
import { adminPass, adminUser, apiBase, apiLogin, createUserViaApi, loginAs } from '../helpers/auth.js'

// ทุก route ที่ router/index.js:208-214 เด้งกลับ /dashboard เมื่อสิทธิ์ไม่พอ
const ADMIN_ONLY_ROUTES = [
  '/admin',
  '/users',
  '/audit',
  '/import',
  '/ocr',
  '/settings/special-areas',
  '/settings/permissions',
]

const stamp = Date.now()

/** user ที่ describe นี้สร้าง — เก็บไว้ deactivate ใน afterEach (กันสะสมข้ามรอบ) */
const createdUserIds = []

test.describe('role guards (router)', () => {
  test.afterEach(async ({ request }) => {
    const admin = await apiLogin(request, adminUser, adminPass)
    for (const userId of createdUserIds) {
      await request.put(`${apiBase()}/users/${userId}`, {
        headers: {
          Authorization: `Bearer ${admin.token}`,
          'X-CSRF-Token': admin.csrf_token,
        },
        data: { is_active: 0 },
      }).catch(() => {})
    }
    createdUserIds.length = 0
  })
  test('operator is bounced from every admin-only route', async ({ page, request }) => {
    const creds = await createUserViaApi(request, {
      username: `e2e_guard_op_${stamp}`,
      password: 'GuardOp1!',
      role: 'operator',
      fullName: 'E2E Guard Operator',
    })
    createdUserIds.push(creds.userId)

    await loginAs(page, creds.username, creds.password)
    await page.waitForURL('**/dashboard')

    for (const route of ADMIN_ONLY_ROUTES) {
      await page.goto(route)
      await expect(page).toHaveURL(/\/dashboard/, { timeout: 10_000 })
    }
  })

  test('viewer is bounced from admin routes but can still read dashboard', async ({ page, request }) => {
    const creds = await createUserViaApi(request, {
      username: `e2e_guard_viewer_${stamp}`,
      password: 'GuardViewer1!',
      role: 'viewer',
      fullName: 'E2E Guard Viewer',
    })
    createdUserIds.push(creds.userId)

    await loginAs(page, creds.username, creds.password)
    await page.waitForURL('**/dashboard')

    // login ใช้ได้จริง — viewer เปิดหน้า read ที่ matrix อนุญาตได้
    await expect(
      page.getByRole('heading', { name: 'ภาพรวมระบบสมุดพก' }),
    ).toBeVisible()

    for (const route of ADMIN_ONLY_ROUTES) {
      await page.goto(route)
      await expect(page).toHaveURL(/\/dashboard/, { timeout: 10_000 })
    }
  })

  test('admin opens admin routes but is bounced from superadmin-only settings', async ({ page, request }) => {
    const creds = await createUserViaApi(request, {
      username: `e2e_guard_adm_${stamp}`,
      password: 'GuardAdm1!',
      role: 'admin',
      fullName: 'E2E Guard Admin',
    })
    createdUserIds.push(creds.userId)

    await loginAs(page, creds.username, creds.password)
    await page.waitForURL('**/dashboard')

    await page.goto('/users')
    await expect(page).toHaveURL(/\/users/)
    await expect(page.getByRole('heading', { name: 'จัดการผู้ใช้' })).toBeVisible()

    await page.goto('/admin')
    await expect(page).toHaveURL(/\/admin/)
    await expect(page.getByRole('heading', { name: 'การจัดการระบบ' })).toBeVisible()

    await page.goto('/settings/permissions')
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10_000 })
  })

  test('superadmin can stay on superadmin-only settings', async ({ page, request }) => {
    // seed admin ใน local DB ถูก migration 27 เลื่อนเป็น superadmin แล้ว — ตรวจก่อน
    const me = await apiLogin(request, adminUser, adminPass)
    const isSuperadmin = me.user?.role === 'superadmin'
    test.skip(!isSuperadmin, 'seed admin is not superadmin in this environment')

    await loginAs(page, adminUser, adminPass)
    await page.waitForURL('**/dashboard')

    await page.goto('/settings/permissions')
    // assert URL เท่านั้น — ไม่ผูกกับ markup ของ SettingsPage
    await expect(page).toHaveURL(/\/settings\/permissions/)
  })
})