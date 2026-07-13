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
