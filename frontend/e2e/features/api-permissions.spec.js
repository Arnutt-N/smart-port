import { test, expect } from '@playwright/test'
import { apiBase, apiLogin, createUserViaApi, thaiCitizenId } from '../helpers/auth.js'

/**
 * Backend permission matrix (backend/authz.php) ผ่าน HTTP จริง — ต่างจาก PHPUnit
 * ที่ทดสอบ function-level seam เท่านั้น (PermissionGateHttpTest, PersonnelAuthzHttpTest)
 */
const stamp = Date.now()

// prefix 10 หลัก unique ต่อรอบ + suffix 2 หลักต่อ test = 12 หลักพอดีก่อนเติม check digit
const CID_PREFIX = `555${String(stamp % 10_000_000).padStart(7, '0')}`

/** user ที่ describe นี้สร้าง — เก็บไว้ deactivate ใน afterEach (กันสะสมข้ามรอบ) */
const createdUserIds = []

async function expectForbidden(res, requiredPermission) {
  expect(res.status(), await res.text()).toBe(403)
  const body = await res.json()
  expect(body.error).toBe('Forbidden')
  expect(body.required_permission).toBe(requiredPermission)
}

test.describe('api permission matrix', () => {
  test.afterEach(async ({ request }) => {
    if (createdUserIds.length === 0) return
    const admin = await apiLogin(request, 'admin', 'admin123')
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
  test('viewer can read allowed resources but is denied write and restricted read', async ({ request }) => {
    const creds = await createUserViaApi(request, {
      username: `e2e_api_viewer_${stamp}`,
      password: 'ApiViewer1!',
      role: 'viewer',
      fullName: 'E2E Api Viewer',
    })
    createdUserIds.push(creds.userId)
    const viewer = await apiLogin(request, creds.username, creds.password)

    const authHeaders = {
      Authorization: `Bearer ${viewer.token}`,
    }

    // matrix: viewer read = multiplier, personnel, candidates, probation, dashboard, profile
    const dashboard = await request.get(`${apiBase()}/dashboard`, { headers: authHeaders })
    expect(dashboard.status()).toBe(200)

    const personnel = await request.get(`${apiBase()}/personnel`, { headers: authHeaders })
    expect(personnel.status()).toBe(200)

    // users / audit ไม่อยู่ใน read list ของ viewer
    await expectForbidden(
      await request.get(`${apiBase()}/users`, { headers: authHeaders }),
      'read:users',
    )
    await expectForbidden(
      await request.get(`${apiBase()}/audit`, { headers: authHeaders }),
      'read:audit',
    )

    await expectForbidden(
      await request.post(`${apiBase()}/personnel`, {
        headers: { ...authHeaders, 'X-CSRF-Token': viewer.csrf_token },
        data: { first_name: 'ทดสอบ', last_name: 'วิวเวอร์', citizen_id: thaiCitizenId(CID_PREFIX + '01') },
      }),
      'create:personnel',
    )
    await expectForbidden(
      await request.post(`${apiBase()}/import/executive`, {
        headers: { ...authHeaders, 'X-CSRF-Token': viewer.csrf_token },
        multipart: { file: { name: 'x.xlsx', mimeType: 'application/zip', buffer: Buffer.from('PK') } },
      }),
      'create:import',
    )
  })

  test('operator can read everywhere but cannot write personnel, delete, or import', async ({ request }) => {
    const creds = await createUserViaApi(request, {
      username: `e2e_api_op_${stamp}`,
      password: 'ApiOp12!',
      role: 'operator',
      fullName: 'E2E Api Operator',
    })
    createdUserIds.push(creds.userId)
    const op = await apiLogin(request, creds.username, creds.password)

    const authHeaders = {
      Authorization: `Bearer ${op.token}`,
    }

    const dashboard = await request.get(`${apiBase()}/dashboard`, { headers: authHeaders })
    expect(dashboard.status()).toBe(200)

    const users = await request.get(`${apiBase()}/users`, { headers: authHeaders })
    expect(users.status()).toBe(200)

    await expectForbidden(
      await request.post(`${apiBase()}/personnel`, {
        headers: { ...authHeaders, 'X-CSRF-Token': op.csrf_token },
        data: { first_name: 'ทดสอบ', last_name: 'โอเปอเรเตอร์', citizen_id: thaiCitizenId(CID_PREFIX + '02') },
      }),
      'create:personnel',
    )

    // operator delete = [] ทุก resource — DELETE เป็น stateful method ต้องแนบ CSRF (api.php:149-153)
    await expectForbidden(
      await request.delete(`${apiBase()}/civil-servants/999999`, {
        headers: { ...authHeaders, 'X-CSRF-Token': op.csrf_token },
      }),
      'delete:personnel',
    )

    // 403 ต้องเกิดก่อน validation ของ import (ยังไม่แนบไฟล์ก็ต้องโดน 403)
    await expectForbidden(
      await request.post(`${apiBase()}/import/executive`, {
        headers: { ...authHeaders, 'X-CSRF-Token': op.csrf_token },
        multipart: { file: { name: 'x.xlsx', mimeType: 'application/zip', buffer: Buffer.from('PK') } },
      }),
      'create:import',
    )
  })

  test('admin passes permission gates and hits validation instead — personnel create lifecycle', async ({ request }) => {
    const creds = await createUserViaApi(request, {
      username: `e2e_api_adm_${stamp}`,
      password: 'ApiAdm1!',
      role: 'admin',
      fullName: 'E2E Api Admin',
    })
    createdUserIds.push(creds.userId)
    const admin = await apiLogin(request, creds.username, creds.password)
    const authHeaders = {
      Authorization: `Bearer ${admin.token}`,
      'X-CSRF-Token': admin.csrf_token,
    }

    // admin ผ่าน permission gate ของ import → ตกไปโดน validation "ไม่มีไฟล์"
    const noFile = await request.post(`${apiBase()}/import/executive`, {
      headers: authHeaders,
      multipart: {},
    })
    expect(noFile.status(), await noFile.text()).toBe(400)
    expect(await noFile.text()).toContain('กรุณาแนบไฟล์ Excel')

    // สร้าง personnel จริงผ่าน API — success แล้ว deactivate เป็น cleanup
    const citizenId = thaiCitizenId(CID_PREFIX + '03')
    const create = await request.post(`${apiBase()}/personnel`, {
      headers: authHeaders,
      data: {
        first_name: 'ทดสอบ',
        last_name: 'อีทูไอ',
        citizen_id: citizenId,
      },
    })
    expect(create.status(), await create.text()).toBe(201)
    const created = await create.json()
    expect(created.success).toBe(true)
    expect(created.personnel_id).toBeTruthy()

    // deactivate (soft) — ทำความสะอาดข้อมูลที่ test สร้างเอง
    const deactivate = await request.put(`${apiBase()}/personnel/${created.personnel_id}`, {
      headers: authHeaders,
      data: { is_active: false },
    })
    expect(deactivate.status(), await deactivate.text()).toBe(200)

    // duplicate citizen_id กับแถวที่เพิ่งสร้าง (ยังอยู่ในระบบแม้ปิดใช้งาน) → 409
    const dup = await request.post(`${apiBase()}/personnel`, {
      headers: authHeaders,
      data: {
        first_name: 'ทดสอบ',
        last_name: 'ซ้ำซ้อก',
        citizen_id: citizenId,
      },
    })
    expect(dup.status(), await dup.text()).toBe(409)
  })
})