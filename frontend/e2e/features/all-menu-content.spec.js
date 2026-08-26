import { test, expect } from '@playwright/test'
import { loginAsAdmin } from '../helpers/auth.js'

const expectedMenuPaths = [
  '/dashboard',
  '/personnel',
  '/probation-end',
  '/candidates/overview',
  '/candidates/general',
  '/candidates/academic',
  '/candidates/support',
  '/candidates/management',
  '/time-counting',
  '/time-multiplier',
  '/time-difference',
  '/position-compare',
  '/royal-decorations',
  '/retirement-report',
  '/admin',
  '/work-results',
  '/awards',
  '/import',
  // '/ocr' ถูกซ่อนจากเมนูจนกว่า document-ocr service จะ deploy จริง (#147) — route ยังอยู่สำหรับ direct URL
  '/users',
  '/audit',
  '/settings/special-areas',
]

test('all sidebar menu destinations keep the content area rendered', async ({ page }) => {
  const pageErrors = []
  page.on('pageerror', (error) => pageErrors.push(`${page.url()}: ${String(error)}`))

  await loginAsAdmin(page)
  await page.setViewportSize({ width: 1440, height: 900 })

  for (const label of ['Candidate Lists', 'การนับเวลาเพิ่มเติม']) {
    await page.getByRole('button', { name: label }).click()
  }

  const destinations = await page.locator('nav a[href]').evaluateAll((links) => (
    links.map((link) => ({
      href: link.getAttribute('href'),
      label: link.textContent?.trim() || link.getAttribute('href'),
    }))
  ))

  expect(destinations).toHaveLength(expectedMenuPaths.length)
  expect(destinations.map(({ href }) => href).sort()).toEqual([...expectedMenuPaths].sort())

  for (const { href, label } of destinations) {
    await test.step(`${label} (${href})`, async () => {
      await page.locator(`nav a[href="${href}"]`).click()
      await expect.poll(() => new URL(page.url()).pathname).toBe(href)
      const main = page.locator('main')
      await expect(main).toBeVisible()
      await expect(
        main,
        `${href} must not remain on the route loading fallback`,
      ).not.toContainText('กำลังโหลดหน้า...')
      await expect.poll(
        async () => (await main.innerText()).trim().length,
        { message: `${href} content area must not be blank` },
      ).toBeGreaterThan(5)
    })
  }

  expect(pageErrors, `unexpected page errors:\n${pageErrors.join('\n')}`).toEqual([])
})
