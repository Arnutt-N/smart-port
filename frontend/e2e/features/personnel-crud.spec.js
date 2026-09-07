import { test, expect } from '@playwright/test'
import { adminPass, adminUser, apiBase, apiLogin, loginAsAdmin, thaiCitizenId } from '../helpers/auth.js'

/**
 * UI CRUD flow บน /personnel (PersonnelPage) — PHPUnit ครอบ validation ที่ function level
 * (PersonnelMasterCrudTest) แต่ E2E ครอบ flow ผ่าน UI จริง + สถานะปิดใช้งาน/เปิดกลับ
 *
 * selector notes: modal ของหน้านี้เป็น div ธรรมดา (ไม่มี role="dialog") — scope ปุ่ม
 * ใน modal ด้วย .fixed เพราะปุ่ม 'ปิดใช้งาน'/'เปิดใช้งาน' ใน row กับใน modal confirm
 * ชื่อเหมือนกัน, และใช้ #id แทน getByLabel (label มีดาว * ต่อท้าย)
 */
const stamp = Date.now()

// prefix 9 หลัก unique ต่อรอบ + เลขลำดับ test 3 หลัก = 12 หลักพอดีก่อนเติม check digit
const CITIZEN_PREFIX_BASE = `996${String(stamp % 1_000_000).padStart(6, '0')}`

function citizenFor(n) {
  return thaiCitizenId(`${CITIZEN_PREFIX_BASE}${String(n).padStart(3, '0')}`)
}

async function searchPersonnel(page, name) {
  await page.getByPlaceholder('ค้นหาชื่อ เลขบัตร หรือรหัสพนักงาน...').fill(name)
  await page.waitForTimeout(600)
}

function rowOf(page, name) {
  return page.getByRole('row', { name: new RegExp(name) })
}

/** สร้าง personnel ผ่าน API พร้อม cleanup handle */
async function createPersonnelViaApi(request, firstName, lastName, citizenId) {
  const admin = await apiLogin(request, adminUser, adminPass)
  const create = await request.post(`${apiBase()}/personnel`, {
    headers: {
      Authorization: `Bearer ${admin.token}`,
      'X-CSRF-Token': admin.csrf_token,
    },
    data: {
      first_name: firstName,
      last_name: lastName,
      citizen_id: citizenId,
    },
  })
  expect(create.status(), await create.text()).toBe(201)
  return (await create.json()).personnel_id
}

/** deactivate ผ่าน API (best-effort) — cleanup ข้อมูลที่ test สร้างเอง */
async function deactivatePersonnel(request, personnelId) {
  try {
    const admin = await apiLogin(request, adminUser, adminPass)
    await request.put(`${apiBase()}/personnel/${personnelId}`, {
      headers: {
        Authorization: `Bearer ${admin.token}`,
        'X-CSRF-Token': admin.csrf_token,
      },
      data: { is_active: false },
    })
  } catch {
    // best-effort — ไม่ให้ cleanup พัง test ผลลัพธ์
  }
}

test.describe('personnel CRUD (admin UI)', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/personnel')
    await expect(page.getByRole('heading', { name: 'ข้อมูลบุคลากร' })).toBeVisible()
  })

  test('admin creates personnel with valid citizen id and it appears in list', async ({ page }) => {
    const lastName = `ครู้เด็ต${stamp % 100}`
    const citizenId = citizenFor(1)

    await page.getByRole('button', { name: 'เพิ่มบุคลากร' }).click()
    await expect(page.getByText('เพิ่มบุคลากรใหม่')).toBeVisible()

    await page.locator('#personnel-first-name').fill('อีทูอาย')
    await page.locator('#personnel-last-name').fill(lastName)
    await page.locator('#personnel-citizen-id').fill(citizenId)

    await page.getByRole('button', { name: 'สร้างบุคลากร' }).click()

    await expect(page.getByText('สร้างบุคลากรสำเร็จ')).toBeVisible()

    // แถวใหม่โผล่ในตาราง (ตอน modal ปิดแล้ว list refresh)
    await searchPersonnel(page, lastName)
    await expect(rowOf(page, lastName)).toBeVisible()
  })

  test('client-side rejects bad citizen id checksum without calling API', async ({ page }) => {
    const badId = citizenFor(2)
    const tampered = badId.slice(0, 12) + (badId[12] === '0' ? '1' : '0')

    await page.getByRole('button', { name: 'เพิ่มบุคลากร' }).click()
    await page.locator('#personnel-first-name').fill('อีทูอาย')
    await page.locator('#personnel-last-name').fill(`เช็คซัม${stamp % 100}`)
    await page.locator('#personnel-citizen-id').fill(tampered)

    await page.getByRole('button', { name: 'สร้างบุคลากร' }).click()

    await expect(page.getByText('เลขบัตรประชาชนไม่ถูกต้อง')).toBeVisible()
    // modal ยังเปิดอยู่ — ไม่ได้ปิดไปเพราะสร้างสำเร็จ
    await expect(page.getByText('เพิ่มบุคลากรใหม่')).toBeVisible()
  })

  test('admin edits personnel — citizen id immutable', async ({ page, request }) => {
    const lastName = `แก้ไขด้${stamp % 100}`
    const personnelId = await createPersonnelViaApi(request, 'อีทูอาย', lastName, citizenFor(3))

    await searchPersonnel(page, lastName)
    await rowOf(page, lastName).getByRole('button', { name: 'แก้ไข' }).click()

    await expect(page.getByText('แก้ไขบุคลากร')).toBeVisible()
    await expect(page.getByText('เลขบัตรแก้ไขไม่ได้ — หากผิดให้ปิดใช้งานแล้วสร้างใหม่')).toBeVisible()

    await page.locator('#personnel-last-name').fill(`${lastName}จบ`)
    await page.getByRole('button', { name: 'บันทึก' }).click()

    await expect(page.getByText('บันทึกข้อมูลบุคลากรสำเร็จ')).toBeVisible()

    await deactivatePersonnel(request, personnelId)
  })

  test('admin deactivates personnel then reactivates via hidden filter', async ({ page, request }) => {
    const lastName = `ทอกเกิล${stamp % 100}`
    const personnelId = await createPersonnelViaApi(request, 'อีทูอาย', lastName, citizenFor(4))

    await searchPersonnel(page, lastName)
    const row = rowOf(page, lastName)
    await expect(row).toBeVisible()

    // ปิดใช้งาน — ปุ่มใน row กับปุ่ม confirm ใน modal ชื่้ 'ปิดใช้งาน' เหมือนกัน
    await row.getByRole('button', { name: 'ปิดใช้งาน' }).click()
    await expect(page.getByText('ยืนยันการปิดใช้งาน')).toBeVisible()
    await page.locator('.fixed').getByRole('button', { name: 'ปิดใช้งาน' }).click()

    await expect(page.getByText('ปิดใช้งานสำเร็จ')).toBeVisible()
    // แถวหายจาก default list (ค่าเริ่มต้นไม่แสดงที่ปิดใช้งาน)
    await expect(row).toHaveCount(0)

    // เปิดตัวกรองแสดงที่ปิดใช้งาน — แถวกลับมาพร้อม badge
    await page.locator('#personnel-include-inactive').check()
    await expect(row).toBeVisible()
    await expect(row.getByText('ปิดใช้งาน', { exact: true })).toBeVisible()

    // เปิดกลับ — ปุ่ม row กลายเป็น 'เปิดใช้งาน' ปุ่ม confirm ใน modal ก็ 'เปิดใช้งาน' เหมือนกัน
    await row.getByRole('button', { name: 'เปิดใช้งาน' }).click()
    await expect(page.getByText('ยืนยันการเปิดใช้งาน')).toBeVisible()
    await page.locator('.fixed').getByRole('button', { name: 'เปิดใช้งาน' }).click()

    await expect(page.getByText('เปิดใช้งานสำเร็จ')).toBeVisible()
    await expect(row.getByText('ใช้งาน', { exact: true })).toBeVisible()

    // cleanup — ปิดกลับเพื่อไม่สะสม
    await deactivatePersonnel(request, personnelId)
  })
})