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

// Needs the sample Skills from scripts/seed-skills.ts: CI adds them; preview databases don't have them.
test.describe('with the sample Skills', () => {
  test.skip(!process.env.E2E_SAMPLE_SKILLS, 'Run `pnpm payload run scripts/seed-skills.ts` and set E2E_SAMPLE_SKILLS=1.')

  test('a visitor who saves a Skill is asked to sign in, and a delisted Skill has no save', async ({ page }) => {
    await page.goto('/en/resources/skills/sample-release-notes')
    const save = page.getByRole('main').getByRole('button', { name: en.saves.save, exact: true })
    await expect(save).toHaveAttribute('aria-pressed', 'false')
    await save.click()
    const dialog = page.getByRole('dialog', { name: en.saves.signInTitle })
    await expect(dialog).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()

    await page.goto('/en/resources/skills/sample-delisted-skill')
    await expect(page.getByRole('heading', { level: 1, name: 'Delisted Sample Skill' })).toBeVisible()
    await expect(page.getByRole('button', { name: en.saves.save, exact: true })).toHaveCount(0)
  })

  test('phones keep save and copy in a bar at the bottom', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/en/resources/skills/sample-release-notes')
    // The header's save is for wide screens; on phones the bar's bookmark is the only one.
    const save = page.getByRole('button', { name: en.saves.save, exact: true })
    await expect(save).toHaveCount(1)
    await expect(page.getByRole('main').getByRole('button', { name: en.saves.save, exact: true })).toHaveCount(0)
    // One copy button in the install panel, one in the bar.
    await expect(page.getByRole('button', { name: en.resources.install.copy })).toHaveCount(2)
    await save.click()
    await expect(page.getByRole('dialog', { name: en.saves.signInTitle })).toBeVisible()
  })

  test('a member saves a Skill and finds it under Saved', async ({ page, context, baseURL }) => {
    test.skip(
      !process.env.DATABASE_URI || !process.env.BETTER_AUTH_SECRET,
      'Signs a member in through the database: needs DATABASE_URI and BETTER_AUTH_SECRET, as in CI.',
    )
    const member = await createMember(baseURL ?? 'http://localhost:3000')
    try {
      await context.addCookies([member.cookie])
      const main = page.getByRole('main')

      // Back from signing in with the save in the address: it finishes by itself, and the address is cleaned up.
      await page.goto(`/en/resources/skills/sample-sql-helper?save=skill-${await member.skillId('sample-sql-helper')}`)
      await expect(main.getByRole('button', { name: en.saves.saved, exact: true })).toHaveAttribute('aria-pressed', 'true')
      await expect(page).toHaveURL(/\/en\/resources\/skills\/sample-sql-helper$/)
      await expect(main.getByText('· 1 save')).toBeVisible()

      // Only Skills visitors can see are saved.
      const delisted = await page.request.post('/api/saves', {
        data: { type: 'skill', id: await member.skillId('sample-delisted-skill'), saved: true },
      })
      expect(delisted.status()).toBe(404)

      await page.goto('/en/me/saves')
      const saved = page.getByRole('region', { name: new RegExp(`^${en.saves.skills}`) })
      await expect(saved.getByRole('link')).toHaveText([/SQL Helper/])
      await saved.getByRole('button', { name: en.saves.removeName.replace('{name}', 'SQL Helper') }).click()
      await expect(page.getByText(en.saves.emptyTitle)).toBeVisible()
      await expect(page.getByRole('link', { name: en.saves.browseSkills })).toHaveAttribute('href', '/en/resources')
    } finally {
      await member.remove()
    }
  })
})

// Needs the sample stories from scripts/seed-stories.ts: CI adds them; preview databases don't have them.
test.describe('with the sample stories', () => {
  test.skip(!process.env.E2E_SAMPLE_STORIES, 'Run `pnpm payload run scripts/seed-stories.ts` and set E2E_SAMPLE_STORIES=1.')

  test('a visitor who saves a story is asked to sign in', async ({ page }) => {
    await page.goto('/en/daily/sample-orbit-notes-benchmark')
    const save = page.getByRole('main').getByRole('button', { name: en.saves.save, exact: true })
    await expect(save).toHaveAttribute('aria-pressed', 'false')
    await save.click()
    const dialog = page.getByRole('dialog', { name: en.saves.signInTitle })
    await expect(dialog).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
  })

  test('a member saves a story and finds it under Saved', async ({ page, context, baseURL }) => {
    test.skip(
      !process.env.DATABASE_URI || !process.env.BETTER_AUTH_SECRET,
      'Signs a member in through the database: needs DATABASE_URI and BETTER_AUTH_SECRET, as in CI.',
    )
    const member = await createMember(baseURL ?? 'http://localhost:3000')
    try {
      await context.addCookies([member.cookie])
      const main = page.getByRole('main')

      // Back from signing in with the save in the address: it finishes by itself, and the address is cleaned up.
      await page.goto(`/en/daily/sample-orbit-notes-benchmark?save=story-${await member.storyId('sample-orbit-notes-benchmark')}`)
      await expect(main.getByRole('button', { name: en.saves.saved, exact: true })).toHaveAttribute('aria-pressed', 'true')
      await expect(page).toHaveURL(/\/en\/daily\/sample-orbit-notes-benchmark$/)

      // Only published stories are saved.
      for (const slug of ['sample-withdrawn-story', 'sample-pending-story']) {
        const hidden = await page.request.post('/api/saves', { data: { type: 'story', id: await member.storyId(slug), saved: true } })
        expect(hidden.status(), slug).toBe(404)
      }

      await page.goto('/en/me/saves')
      const saved = page.getByRole('region', { name: new RegExp(`^${en.saves.stories}`) })
      await expect(saved.getByRole('link')).toHaveText([/Orbit Notes reports a new summarization benchmark/])
      await expect(saved.getByRole('link')).toHaveAttribute('href', '/en/daily/sample-orbit-notes-benchmark')
      await saved
        .getByRole('button', { name: en.saves.removeName.replace('{name}', 'Sample: Orbit Notes reports a new summarization benchmark') })
        .click()
      await expect(page.getByText(en.saves.emptyTitle)).toBeVisible()
    } finally {
      await member.remove()
    }
  })
})
