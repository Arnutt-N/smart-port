import { test, expect } from '@playwright/test'
import { loginAsAdmin } from '../helpers/auth.js'

/**
 * Reproduce: visit /time-difference or /position-compare → content blank,
 * then other menu pages also blank (contagious).
 */
test.describe('content blank contagion', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  test('time-difference then dashboard still shows content', async ({ page }) => {
    const pageErrors = []
    const consoleErrors = []
    page.on('pageerror', (err) => pageErrors.push(String(err)))
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text())
    })

    await page.goto('/time-difference')
    await page.waitForTimeout(1500)

    const mainTextAfterDiverse = (await page.locator('main').innerText()).trim()
    const diverseHeading = await page.getByRole('heading', { name: 'การนับแตกต่าง' }).count()

    await page.goto('/dashboard')
    await page.waitForTimeout(1500)
    const dashHeading = await page.getByRole('heading', { name: 'ภาพรวมระบบสมุดพก' }).count()
    const mainTextAfterDash = (await page.locator('main').innerText()).trim()

    // Attach diagnostics on failure
    expect(
      {
        diverseHeading,
        dashHeading,
        mainTextAfterDiverseLen: mainTextAfterDiverse.length,
        mainTextAfterDashLen: mainTextAfterDash.length,
        pageErrors,
        consoleErrors: consoleErrors.slice(0, 10),
      },
      'content should not go blank after time-difference',
    ).toMatchObject({
      diverseHeading: 1,
      dashHeading: 1,
    })
    expect(mainTextAfterDiverse.length).toBeGreaterThan(20)
    expect(mainTextAfterDash.length).toBeGreaterThan(20)
  })

  test('position-compare then candidates still shows content', async ({ page }) => {
    const pageErrors = []
    page.on('pageerror', (err) => pageErrors.push(String(err)))

    await page.goto('/position-compare')
    await page.waitForTimeout(1500)

    const eqHeading = await page.getByRole('heading', { name: 'การเทียบตำแหน่ง' }).count()
    const mainEq = (await page.locator('main').innerText()).trim()

    await page.goto('/candidates/overview')
    await page.waitForTimeout(2000)
    const mainCand = (await page.locator('main').innerText()).trim()

    expect({ eqHeading, mainEqLen: mainEq.length, mainCandLen: mainCand.length, pageErrors }).toMatchObject({
      eqHeading: 1,
    })
    expect(mainEq.length).toBeGreaterThan(20)
    expect(mainCand.length).toBeGreaterThan(20)
  })

  test('failed DiversePage chunk + SPA nav: content must not stay blank', async ({ page }) => {
    const pageErrors = []
    const consoleErrors = []
    page.on('pageerror', (err) => pageErrors.push(String(err)))
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text())
    })

    await page.goto('/dashboard')
    await expect(page.getByRole('heading', { name: 'ภาพรวมระบบสมุดพก' })).toBeVisible()

    // Break lazy chunk (stale deploy) — SPA click, not full reload
    await page.route('**/assets/DiversePage*.js', (route) => route.fulfill({ status: 404, body: 'missing' }))
    await page.route('**/src/pages/DiversePage.vue*', (route) => route.fulfill({ status: 404, body: 'missing' }))
    await page.route('**/DiversePage*', (route) => {
      if (route.request().resourceType() === 'script' || route.request().url().includes('DiversePage')) {
        return route.fulfill({ status: 404, body: 'missing' })
      }
      return route.continue()
    })

    // Submenu is collapsed by default
    await page.getByRole('button', { name: 'การนับเวลาเพิ่มเติม' }).click()
    await page.getByRole('link', { name: 'การนับแตกต่าง' }).click()

    // Expect: first chunk fail reloads target, second fail falls back to /dashboard
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 20_000 })
    await expect(page.getByRole('heading', { name: 'ภาพรวมระบบสมุดพก' })).toBeVisible({
      timeout: 15_000,
    })

    const mainText = (await page.locator('main').innerText()).trim()
    expect({
      mainLen: mainText.length,
      pageErrors: pageErrors.slice(0, 8),
      consoleErrors: consoleErrors.slice(0, 8),
    }).toMatchObject({})
    expect(mainText.length).toBeGreaterThan(20)
  })
})
