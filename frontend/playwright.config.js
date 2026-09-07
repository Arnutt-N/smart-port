// @ts-check
import { defineConfig, devices } from '@playwright/test'

/**
 * E2E against Vite dev + Docker backend.
 * Prerequisite: `docker compose up -d db backend` (API :8000)
 * Vite is started by webServer (or reuseExistingServer if already up).
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  // 120s: เครื่อง dev นี้เครื่องเดียวกับ workload อื่น (VS Code/ZCode/Docker) —
  // ตอนรันชุดต่อเนื่อง navigation บางอันค้างชั่วคราวเกิน 60s (เจอจริงใน goto /users)
  timeout: 120_000,
  // 20s: backend ใน Docker ตอบช้าเป็นช่วงๆ ตอน E2E รันต่อเนื่อง (toast มาช้ากว่า 10s
  // ทำให้ assert พลาดทั้งที่ action สำเร็จจริง — พิสูจน์ด้วย curl/probe แล้ว)
  expect: { timeout: 20_000 },
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://127.0.0.1:5174',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // E2E_BASE_URL ชี้ไป frontend ภายนอก (เช่น Docker image) — ไม่ต้องเริ่ม Vite เอง
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'npm run dev -- --host 127.0.0.1 --port 5174',
        url: 'http://127.0.0.1:5174',
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
})
