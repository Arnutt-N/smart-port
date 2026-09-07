/**
 * Shared auth helpers for Playwright E2E (local seed / Docker).
 * Credentials from env — defaults match database/09-auth-users.sql comment (dev only).
 */
export const adminUser = process.env.E2E_ADMIN_USER || 'admin'
export const adminPass = process.env.E2E_ADMIN_PASS || 'admin123'

export async function loginAs(page, username, password) {
  await page.goto('/login')
  await page.getByPlaceholder('กรุณาใส่ชื่อผู้ใช้ของคุณ').fill(username)
  await page.getByPlaceholder('กรุณาใส่รหัสผ่านของคุณ').fill(password)
  await page.getByRole('button', { name: /เข้าสู่ระบบ/i }).click()
}

export async function loginAsAdmin(page) {
  await loginAs(page, adminUser, adminPass)
  await page.waitForURL(/\/(dashboard|change-password)/)
  if (page.url().includes('/change-password')) {
    throw new Error(
      'Admin must_change_password=1 — clear flag locally or change password before E2E'
    )
  }
  await page.waitForURL('**/dashboard')
}

/** API base as seen from the browser (Vite proxy). */
export function apiBase() {
  return process.env.E2E_API_BASE || 'http://127.0.0.1:8000'
}

export async function apiLogin(request, username, password) {
  const res = await request.post(`${apiBase()}/auth/login`, {
    data: { username, password },
  })
  if (!res.ok()) {
    throw new Error(`API login failed (${res.status()}): ${await res.text()}`)
  }
  return res.json()
}

/**
 * ส่ง request แบบ retry-once เมื่อโดน 429 — rate limit global เขียน 50/min ต่อ user
 * (backend/middleware/rate_limit.php rateLimitGlobal) และ E2E ทุก test ใช้ seed admin
 * คนเดียว รันต่อเนื่องจึงแตะเพดานได้ รอตาม retry_after แล้วยิงซ้ำครั้งเดียว
 */
export async function sendWith429Retry(request, method, url, options) {
  let res = await request[method](url, options)
  if (res.status() === 429) {
    const body = await res.json().catch(() => ({}))
    const wait = Math.min(Number(body.retry_after) || 60, 65) * 1000
    await new Promise((r) => setTimeout(r, wait))
    res = await request[method](url, options)
  }
  return res
}

/**
 * สร้าง user ผ่าน API ด้วย seed admin แล้วปลดล็อก must_change_password ทันที
 * คืน { username, password, userId } — password เป็น "รหัสที่สอง" หลังเปลี่ยน
 * (backend ห้ามตั้งรหัสใหม่ให้ซ้ำกับเดิม จึงเปลี่ยนเป็น password + "1e" แทน)
 * userId ใช้ deactivate เป็น cleanup ใน afterEach
 */
export async function createUserViaApi(request, { username, password, role, fullName }) {
  const admin = await apiLogin(request, adminUser, adminPass)

  const create = await sendWith429Retry(request, 'post', `${apiBase()}/users`, {
    headers: {
      Authorization: `Bearer ${admin.token}`,
      'X-CSRF-Token': admin.csrf_token,
    },
    data: {
      username,
      password,
      full_name: fullName,
      role,
    },
  })
  if (create.status() !== 201) {
    throw new Error(`Create user failed (${create.status()}): ${await create.text()}`)
  }
  const body = await create.json()

  // First login forces password change — เปลี่ยนให้เสร็จใน helper เพื่อไม่ให้ทุก spec ต้องทำซ้ำ
  const finalPassword = `${password}1e`
  const first = await apiLogin(request, username, password)
  const changed = await sendWith429Retry(request, 'post', `${apiBase()}/auth/change-password`, {
    headers: {
      Authorization: `Bearer ${first.token}`,
      'X-CSRF-Token': first.csrf_token,
    },
    data: {
      current_password: password,
      new_password: finalPassword,
    },
  })
  if (!changed.ok()) {
    throw new Error(`Clear must_change_password failed (${changed.status()}): ${await changed.text()}`)
  }

  return { username, password: finalPassword, userId: body.user_id }
}

/**
 * Thai citizen ID 13 หลักที่ผ่าน checksum — อัลกอริทึมเดียวกับ backend isValidCitizenId
 * (backend/helpers.php:24-35): weight 13..2, check = (11 - sum%11) % 10
 */
export function thaiCitizenId(first12Digits) {
  const digits = String(first12Digits).replace(/\D/g, '')
  if (digits.length !== 12) {
    throw new Error(`thaiCitizenId expects 12 digits, got ${digits.length}`)
  }
  let sum = 0
  for (let i = 0; i < 12; i++) {
    sum += Number(digits[i]) * (13 - i)
  }
  const check = (11 - (sum % 11)) % 10
  return digits + String(check)
}
