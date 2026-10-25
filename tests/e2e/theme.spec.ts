import { readFileSync } from 'node:fs'

import { expect, test, type Page } from '@playwright/test'

import type enMessages from '../../messages/en.json'

const en = JSON.parse(readFileSync(new URL('../../messages/en.json', import.meta.url), 'utf8')) as typeof enMessages

const background = (page: Page) => page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor)
const dark = 'rgb(31, 31, 34)'
const light = 'rgb(255, 255, 255)'

test.describe('dark mode', () => {
  test.use({ colorScheme: 'dark' })

  test('follows the system, and a pick in the footer sticks across reloads', async ({ page, context }) => {
    await page.goto('/en')
    await expect.poll(() => background(page)).toBe(dark)
    const appearance = page.getByRole('group', { name: en.theme.label })
    await expect(appearance.getByRole('button', { name: en.theme.system })).toHaveAttribute('aria-pressed', 'true')

    await appearance.getByRole('button', { name: en.theme.light }).click()
    await expect.poll(() => background(page)).toBe(light)
    expect((await context.cookies()).find((cookie) => cookie.name === 'IFAI_THEME')?.value).toBe('light')

    await page.reload()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
    await expect.poll(() => background(page)).toBe(light)

    await appearance.getByRole('button', { name: en.theme.system }).click()
    await expect(page.locator('html')).not.toHaveAttribute('data-theme')
    await expect.poll(() => background(page)).toBe(dark)
    expect((await context.cookies()).some((cookie) => cookie.name === 'IFAI_THEME')).toBe(false)
  })
})
