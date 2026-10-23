import { readFileSync } from 'node:fs'

import { expect, test } from '@playwright/test'

import type enMessages from '../../messages/en.json'

import { createMember } from './member'

const en = JSON.parse(readFileSync(new URL('../../messages/en.json', import.meta.url), 'utf8')) as typeof enMessages

test('the saves API answers visitors, and only members can save', async ({ request }) => {
  const state = await request.get('/api/saves?type=app&id=1')
  expect(state.status()).toBe(200)
  expect(state.headers()['cache-control']).toBe('private, no-store')
  expect(await state.json()).toMatchObject({ signedIn: false, saved: false })

  expect((await request.get('/api/saves?type=app&id=abc')).status()).toBe(400)
  expect((await request.post('/api/saves', { data: { type: 'app', id: 1, saved: true } })).status()).toBe(401)
  const fromElsewhere = await request.post('/api/saves', {
    data: { type: 'app', id: 1, saved: true },
    headers: { 'sec-fetch-site': 'cross-site' },
  })
  expect(fromElsewhere.status()).toBe(403)
})

test('「我的收藏」asks a visitor to sign in', async ({ page }) => {
  const response = await page.goto('/en/me/saves')
  expect(response?.status()).toBe(200)
  await expect(page.getByRole('heading', { level: 1, name: en.saves.title })).toBeVisible()
  await expect(page.getByText(en.saves.signInBody)).toBeVisible()
})

// Needs the sample apps from scripts/seed-apps.ts: CI adds them; preview databases don't have them.
test.describe('with the sample apps', () => {
  test.skip(!process.env.E2E_SAMPLE_APPS, 'Run `pnpm payload run scripts/seed-apps.ts` and set E2E_SAMPLE_APPS=1.')

  test('a visitor who presses save is asked to sign in', async ({ page }) => {
    await page.goto('/en/apps/kitecode')
    const save = page.getByRole('main').getByRole('button', { name: en.saves.save, exact: true })
    await expect(save).toHaveAttribute('aria-pressed', 'false')
    await save.click()
    const dialog = page.getByRole('dialog', { name: en.saves.signInTitle })
    await expect(dialog).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
  })

  test('a member saves apps and finds them under Saved', async ({ page, context, baseURL }) => {
    test.skip(
      !process.env.DATABASE_URI || !process.env.BETTER_AUTH_SECRET,
      'Signs a member in through the database: needs DATABASE_URI and BETTER_AUTH_SECRET, as in CI.',
    )
    const member = await createMember(baseURL ?? 'http://localhost:3000')
    try {
      await context.addCookies([member.cookie])
      const main = page.getByRole('main')

      // Back from signing in with the save in the address: it finishes by itself, and the address is cleaned up.
      await page.goto(`/en/apps/lumen-chat?save=app-${await member.appId('lumen-chat')}`)
      await expect(main.getByRole('button', { name: en.saves.saved, exact: true })).toHaveAttribute('aria-pressed', 'true')
      await expect(page).toHaveURL(/\/en\/apps\/lumen-chat$/)
      await expect(main.getByText('· 1 save')).toBeVisible()

      await page.goto('/en/apps/kitecode')
      await main.getByRole('button', { name: en.saves.save, exact: true }).click()
      await expect(main.getByRole('button', { name: en.saves.saved, exact: true })).toHaveAttribute('aria-pressed', 'true')

      // The account menu leads to the saved apps, newest first.
      await page.getByRole('button', { name: en.header.account }).click()
      await page.getByRole('link', { name: en.header.saves }).click()
      await expect(page).toHaveURL(/\/en\/me\/saves$/)
      const saved = page.getByRole('region', { name: new RegExp(`^${en.saves.apps}`) })
      await expect(saved.getByRole('link')).toHaveText([/Kitecode/, /Lumen Chat/])

      await saved.getByRole('button', { name: 'Remove Kitecode' }).click()
      await expect(saved.getByRole('link')).toHaveText([/Lumen Chat/])
      await saved.getByRole('button', { name: 'Remove Lumen Chat' }).click()
      await expect(page.getByText(en.saves.emptyTitle)).toBeVisible()
      await expect(page.getByRole('link', { name: en.saves.browseApps })).toHaveAttribute('href', '/en/apps')
    } finally {
      await member.remove()
    }
  })
})
