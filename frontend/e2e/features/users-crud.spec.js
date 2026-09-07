import { test, expect } from '@playwright/test'
import {
  adminPass,
  adminUser,
  apiBase,
  apiLogin,
  loginAsAdmin,
  sendWith429Retry,
} from '../helpers/auth.js'

/**
 * UI CRUD flow บน /users (UserManagementPage) — PHPUnit ครอบ guard logic บางส่วน
 * (UserManagementGuardTest) แต่ไม่มี E2E ทดสอบ flow ผ่าน UI จริงเลย
 *
 * selector notes:
 * - modal ทั้งหมดเป็น div ธรรมดา (ไม่มี role="dialog") — scope ด้วย .fixed
 *   กันชนปุ่มใน row ที่ชื่อเดียวกัน (ปุ่ม 'ปิดบัญชี'/'รีเซ็ตรหัสผ่าน' ใน modal
 *   กับใน row ชื่อเหมือนกันเป๊ะ)
 * - ใช้ #id ตรง ๆ แทน getByLabel เพราะ label มีดาว * ต่อท้าย ('รหัสผ่าน *')
 *   และ 'รหัสผ่าน' เป็น substring ของ 'ยืนยันรหัสผ่าน'
 */
const stamp = Date.now()

/** สร้าง user เป้าหมายผ่าน API แล้วคืน { username, userId } พร้อมใช้ */
async function createTargetUser(request, username) {
  const admin = await apiLogin(request, adminUser, adminPass)
  const create = await sendWith429Retry(request, 'post', `${apiBase()}/users`, {
    headers: {
      Authorization: `Bearer ${admin.token}`,
      'X-CSRF-Token': admin.csrf_token,
    },
    data: {
      username,
      password: 'CrudTarget1!',
      full_name: 'เป้าหมาย เดิม',
      role: 'operator',
    },
  })
  if (create.status() !== 201) {
    throw new Error(`createTargetUser failed (${create.status()}): ${await create.text()}`)
  }
  const body = await create.json()

  // ปลดล็อก must_change_password — เปลี่ยนเป็นรหัสเดิม
  const first = await apiLogin(request, username, 'CrudTarget1!')
  await sendWith429Retry(request, 'post', `${apiBase()}/auth/change-password`, {
    headers: {
      Authorization: `Bearer ${first.token}`,
      'X-CSRF-Token': first.csrf_token,
    },
    data: {
      current_password: 'CrudTarget1!',
      new_password: 'CrudTarget1!',
    },
  })

  return { username, userId: body.user_id }
}

/** รอ debounce 300ms ของ ListSearchInput ให้กรองเสร็จ */
async function searchUser(page, username) {
  await page.getByPlaceholder('ค้นหาชื่อผู้ใช้หรือชื่อ-สกุล...').fill(username)
  await page.waitForTimeout(600)
}

/** หาแถวของ username — row accessible name รวมข้อความทั้งแถว */
function rowOf(page, username) {
  return page.getByRole('row', { name: new RegExp(username) })
}

test.describe('users CRUD (admin UI)', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/users')
    await expect(page.getByRole('heading', { name: 'จัดการผู้ใช้' })).toBeVisible()
  })

  test.afterEach(async ({ request }) => {
    // best-effort: ปิดบัญชีที่ test สร้างทั้งหมด (กันสะสมข้ามรอบ)
    try {
      const admin = await apiLogin(request, adminUser, adminPass)
      const list = await request.get(`${apiBase()}/users?limit=200`, {
        headers: { Authorization: `Bearer ${admin.token}` },
      })
      if (!list.ok()) return
      const body = await list.json()
      const mine = (body.data || []).filter((u) => String(u.username).startsWith('e2e_crud_'))
      for (const u of mine) {
        await sendWith429Retry(request, 'put', `${apiBase()}/users/${u.user_id}`, {
          headers: {
            Authorization: `Bearer ${admin.token}`,
            'X-CSRF-Token': admin.csrf_token,
          },
          data: { is_active: 0 },
        })
      }
    } catch {
      // cleanup ต้องไม่พัง test ผลลัพธ์
    }
  })

  test('admin creates a user via modal and it appears in the list', async ({ page }) => {
    const username = `e2e_crud_new_${stamp}`

    await page.getByRole('button', { name: 'เพิ่มผู้ใช้' }).click()
    await expect(page.getByText('เพิ่มผู้ใช้ใหม่')).toBeVisible()

    await page.locator('#user-username').fill(username)
    await page.locator('#user-password').fill('NewUser1!')
    await page.locator('#user-password-confirm').fill('NewUser1!')
    await page.locator('#user-full-name').fill('ทดสอบ สร้างใหม่')
    await page.locator('#user-role').selectOption({ label: 'Operator — บันทึกข้อมูล' })

    await page.getByRole('button', { name: 'สร้างผู้ใช้' }).click()

    await expect(page.getByText('สร้างผู้ใช้สำเร็จ')).toBeVisible()
    await searchUser(page, username)
    await expect(rowOf(page, username)).toBeVisible()
  })

  test('admin edits full name — username locked while editing', async ({ page, request }) => {
    const username = `e2e_crud_edit_${stamp}`
    await createTargetUser(request, username)

    await searchUser(page, username)
    await rowOf(page, username).getByRole('button', { name: 'แก้ไข' }).click()

    await expect(page.getByText('แก้ไขผู้ใช้')).toBeVisible()
    await expect(page.locator('#user-username')).toBeDisabled()

    await page.locator('#user-full-name').fill('เป้าหมาย แก้ไขแล้ว')
    await page.getByRole('button', { name: 'บันทึก' }).click()

    await expect(page.getByText('บันทึกข้อมูลผู้ใช้สำเร็จ')).toBeVisible()
  })

  test('admin resets a user password', async ({ page, request }) => {
    const username = `e2e_crud_reset_${stamp}`
    await createTargetUser(request, username)

    await searchUser(page, username)
    await rowOf(page, username).getByRole('button', { name: 'รีเซ็ตรหัสผ่าน' }).click()

    // heading ของ modal ('รีเซ็ตรหัสผ่าน' h2) กับปุ่มชื่อเดียวกัน — ใช้ heading role เฉพาะ
    await expect(page.getByRole('heading', { name: 'รีเซ็ตรหัสผ่าน' })).toBeVisible()
    await page.locator('#user-reset-password').fill('ResetNew1!')
    await page.locator('#user-reset-password-confirm').fill('ResetNew1!')

    // ปุ่ม confirm ใน modal ชื่้เดียวกับปุ่มใน row — scope ด้วย .fixed
    await page.locator('.fixed').getByRole('button', { name: 'รีเซ็ตรหัสผ่าน' }).click()

    await expect(page.getByText(/รีเซ็ตรหัสผ่านสำเร็จ/)).toBeVisible()
  })

  test('admin deactivates then reactivates a user', async ({ page, request }) => {
    const username = `e2e_crud_toggle_${stamp}`
    await createTargetUser(request, username)

    await searchUser(page, username)
    const row = rowOf(page, username)
    await expect(row).toBeVisible()

    await row.getByRole('button', { name: 'ปิดบัญชี' }).click()
    await expect(page.getByText('ยืนยันการปิดบัญชี')).toBeVisible()
    await page.locator('.fixed').getByRole('button', { name: 'ปิดบัญชี' }).click()

    await expect(page.getByText('ปิดบัญชีสำเร็จ')).toBeVisible()
    await expect(row.getByText('ปิดใช้งาน', { exact: true })).toBeVisible()

    // เปิดกลับ — ปุ่ม row เปลี่ยนชื่อเป็น 'เปิดใช้งานบัญชี' ปุ่ม modal คือ 'เปิดใช้งาน'
    await row.getByRole('button', { name: 'เปิดใช้งานบัญชี' }).click()
    await expect(page.getByText('ยืนยันการเปิดใช้งานบัญชี')).toBeVisible()
    await page.locator('.fixed').getByRole('button', { name: 'เปิดใช้งาน' }).click()

    await expect(page.getByText('เปิดใช้งานบัญชีสำเร็จ')).toBeVisible()
    await expect(row.getByText('ใช้งาน', { exact: true })).toBeVisible()
  })

  test('own row exposes no deactivate action (self-guard)', async ({ page }) => {
    // seed admin อยู่แถวเดียวหลัง search — แถวของตัวเองต้องไม่มีปุ่มปิดบัญชี
    await searchUser(page, 'admin')
    const ownRow = rowOf(page, 'admin')
    await expect(ownRow).toBeVisible()
    await expect(ownRow.getByRole('button', { name: 'ปิดบัญชี' })).toHaveCount(0)
    // แต่แก้ไขตัวเองได้
    await expect(ownRow.getByRole('button', { name: 'แก้ไข' })).toBeVisible()
  })
})