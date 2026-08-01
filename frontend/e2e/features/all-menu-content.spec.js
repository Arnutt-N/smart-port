import { test, expect } from '@playwright/test'
import { loginAsAdmin } from '../helpers/auth.js'

test('all sidebar menu destinations keep the content area rendered', async ({ page }) => {
  const pageErrors = []
  page.on('pageerror', (error) => pageErrors.push(String(error)))

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

  expect(destinations.length).toBeGreaterThan(15)

  for (const { href, label } of destinations) {
    await test.step(`${label} (${href})`, async () => {
      await page.locator(`nav a[href="${href}"]`).click()
      await expect(page).toHaveURL(new RegExp(`${href.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`))
      await expect.poll(
        async () => (await page.locator('main').innerText()).trim().length,
        { message: `${href} content area must not be blank` },
      ).toBeGreaterThan(5)
    })
  }

  expect(pageErrors, `unexpected page errors:\n${pageErrors.join('\n')}`).toEqual([])
})
