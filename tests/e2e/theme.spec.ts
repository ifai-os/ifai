import { readFileSync } from 'node:fs'

import { expect, test, type Page } from '@playwright/test'

import type enMessages from '../../messages/en.json'

import { createMember } from './member'

const en = JSON.parse(readFileSync(new URL('../../messages/en.json', import.meta.url), 'utf8')) as typeof enMessages

const background = (page: Page) => page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor)
const dark = 'rgb(31, 31, 34)'
const light = 'rgb(255, 255, 255)'

test.describe('dark mode', () => {
  test.use({ colorScheme: 'dark' })

  test('follows the system for a visitor', async ({ page }) => {
    await page.goto('/en')
    await expect.poll(() => background(page)).toBe(dark)
    await expect(page.locator('html')).not.toHaveAttribute('data-theme')
  })

  test.describe('a signed-in member', () => {
    test.skip(
      !process.env.DATABASE_URI || !process.env.BETTER_AUTH_SECRET,
      'Signs a member in through the database: needs DATABASE_URI and BETTER_AUTH_SECRET, as in CI.',
    )

    test('picks light or dark in the account menu and settings, and it sticks across reloads', async ({ page, context, baseURL }) => {
      const member = await createMember(baseURL ?? 'http://localhost:3000')
      try {
        await context.addCookies([member.cookie])
        await page.goto('/en/daily')
        await expect.poll(() => background(page)).toBe(dark)

        await page.getByRole('button', { name: en.header.account }).click()
        await page.getByRole('button', { name: en.header.appearance }).click()
        const menu = page.getByRole('group', { name: en.theme.label })
        await expect(menu.getByRole('button', { name: en.theme.system })).toHaveAttribute('aria-pressed', 'true')
        await menu.getByRole('button', { name: en.theme.light }).click()
        await expect.poll(() => background(page)).toBe(light)
        expect((await context.cookies()).find((cookie) => cookie.name === 'IFAI_THEME')?.value).toBe('light')

        await page.goto('/en/me/account?section=language')
        await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
        await expect.poll(() => background(page)).toBe(light)
        const settings = page.getByRole('group', { name: en.theme.label })
        await expect(settings.getByRole('button', { name: en.theme.light })).toHaveAttribute('aria-pressed', 'true')

        await settings.getByRole('button', { name: en.theme.system }).click()
        await expect(page.locator('html')).not.toHaveAttribute('data-theme')
        await expect.poll(() => background(page)).toBe(dark)
        expect((await context.cookies()).some((cookie) => cookie.name === 'IFAI_THEME')).toBe(false)
      } finally {
        await member.remove()
      }
    })
  })
})
