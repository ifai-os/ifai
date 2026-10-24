import { readFileSync } from 'node:fs'

import { expect, test } from '@playwright/test'

import type enMessages from '../../messages/en.json'

import { createMember } from './member'

const en = JSON.parse(readFileSync(new URL('../../messages/en.json', import.meta.url), 'utf8')) as typeof enMessages

test('the follows API answers visitors, and only members can follow', async ({ request }) => {
  const state = await request.get('/api/follows?t=tag-coding&t=topic-nobodyhere')
  expect(state.status()).toBe(200)
  expect(state.headers()['cache-control']).toBe('private, no-store')
  expect(await state.json()).toEqual({
    signedIn: false,
    following: [],
    counts: { 'tag-coding': expect.any(Number), 'topic-nobodyhere': 0 },
  })

  for (const query of ['', '?t=tag-not-a-tag', '?t=topic-Not%20A%20Key', '?t=story-1']) {
    expect((await request.get(`/api/follows${query}`)).status(), query).toBe(400)
  }
  expect((await request.post('/api/follows', { data: { type: 'tag', key: 'coding', following: true } })).status()).toBe(401)
  const fromElsewhere = await request.post('/api/follows', {
    data: { type: 'tag', key: 'coding', following: true },
    headers: { 'sec-fetch-site': 'cross-site' },
  })
  expect(fromElsewhere.status()).toBe(403)
})

test('「我的关注」asks a visitor to sign in and stays out of search', async ({ page }) => {
  const response = await page.goto('/en/me/following')
  expect(response?.status()).toBe(200)
  await expect(page.getByRole('heading', { level: 1, name: en.follows.title })).toBeVisible()
  await expect(page.getByText(en.follows.signInBody)).toBeVisible()
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/)
})

// Needs the sample stories from scripts/seed-stories.ts: CI adds them; preview databases don't have them.
test.describe('with the sample stories', () => {
  test.skip(!process.env.E2E_SAMPLE_STORIES, 'Run `pnpm payload run scripts/seed-stories.ts` and set E2E_SAMPLE_STORIES=1.')

  const titles = {
    workspaces: 'Sample: Lumen Chat adds shared workspaces for teams',
    weights: 'Sample: Kitecode publishes the weights of its code model',
    benchmark: 'Sample: Orbit Notes reports a new summarization benchmark',
    preview: 'Sample: Lumen Chat previews team workspaces',
  }
  const assistants = en.tags.assistants

  test('a visitor who presses follow is asked to sign in', async ({ page }) => {
    await page.goto('/en/daily/sample-lumen-chat-adds-shared-workspaces')
    const follow = page.getByRole('main').getByRole('button', { name: 'Follow Lumen Labs', exact: true })
    await expect(follow).toHaveAttribute('aria-pressed', 'false')
    await follow.click()
    const dialog = page.getByRole('dialog', { name: en.follows.signInTitle })
    await expect(dialog).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
  })

  test('a member follows a product, a company and a tag, and finds their news under Following', async ({ page, context, baseURL }) => {
    test.skip(
      !process.env.DATABASE_URI || !process.env.BETTER_AUTH_SECRET,
      'Signs a member in through the database: needs DATABASE_URI and BETTER_AUTH_SECRET, as in CI.',
    )
    const member = await createMember(baseURL ?? 'http://localhost:3000')
    try {
      await context.addCookies([member.cookie])
      const main = page.getByRole('main')

      // Back from signing in with the follow in the address: it finishes by itself, and the address is cleaned up.
      await page.goto('/en/daily/sample-lumen-chat-adds-shared-workspaces?follow=topic-lumenchat')
      await expect(main.getByRole('button', { name: en.follows.followingTopic, exact: true })).toHaveAttribute('aria-pressed', 'true')
      await expect(page).toHaveURL(/\/en\/daily\/sample-lumen-chat-adds-shared-workspaces$/)
      // The topic's own row has no second button.
      await expect(main.getByRole('button', { name: /Lumen Chat$/ })).toHaveCount(0)

      await main.getByRole('button', { name: 'Follow Lumen Labs', exact: true }).click()
      await expect(main.getByRole('button', { name: 'Following Lumen Labs', exact: true })).toHaveAttribute('aria-pressed', 'true')
      await main.getByRole('button', { name: `Follow ${assistants}`, exact: true }).click()
      await expect(main.getByRole('button', { name: `Following ${assistants}`, exact: true })).toHaveAttribute('aria-pressed', 'true')

      // Only companies and products a published story is about.
      const nobody = await page.request.post('/api/follows', { data: { type: 'topic', key: 'nobodyhere', following: true } })
      expect(nobody.status()).toBe(404)

      // The account menu leads to them, and to their news only.
      await page.getByRole('button', { name: en.header.account }).click()
      await page.getByRole('link', { name: en.header.following, exact: true }).click()
      await expect(page).toHaveURL(/\/en\/me\/following$/)
      const followed = page.getByRole('region', { name: new RegExp(`^${en.follows.followed}`) })
      await expect(followed.getByRole('link')).toHaveText([assistants, 'Lumen Labs', 'Lumen Chat'])
      await expect(main.getByRole('link', { name: titles.workspaces })).toBeVisible()
      await expect(main.getByRole('link', { name: titles.preview })).toBeVisible()
      for (const title of [titles.weights, titles.benchmark]) await expect(main.getByRole('link', { name: title })).toHaveCount(0)

      // The topic page counts who follows it; following it there says where its news goes.
      await followed.getByRole('link', { name: 'Lumen Chat' }).click()
      await expect(page).toHaveURL(/\/en\/daily\/topic\/lumenchat$/)
      const button = main.getByRole('button', { name: /^Follow(ing)? Lumen Chat$/ })
      await expect(button).toHaveAttribute('aria-pressed', 'true')
      await expect(main.getByText('1 follower', { exact: true })).toBeVisible()
      await button.click()
      await expect(button).toHaveAttribute('aria-pressed', 'false')
      await expect(main.getByText('1 follower', { exact: true })).toHaveCount(0)
      await button.click()
      await expect(button).toHaveAttribute('aria-pressed', 'true')
      await expect(main.getByText('1 follower', { exact: true })).toBeVisible()
      await expect(main.getByRole('link', { name: en.follows.title, exact: true })).toHaveAttribute('href', '/en/me/following')

      // So does the tag's page.
      await page.goto('/en/daily/tag/assistants')
      await expect(main.getByRole('button', { name: `Following ${assistants}`, exact: true })).toHaveAttribute('aria-pressed', 'true')

      await page.goto('/en/me/following')
      await followed.getByRole('button', { name: en.follows.removeName.replace('{name}', 'Lumen Chat') }).click()
      await expect(followed.getByRole('link')).toHaveText([assistants, 'Lumen Labs'])
      await followed.getByRole('button', { name: en.follows.removeName.replace('{name}', 'Lumen Labs') }).click()
      await followed.getByRole('button', { name: en.follows.removeName.replace('{name}', assistants) }).click()
      await expect(page.getByText(en.follows.emptyTitle)).toBeVisible()
      await expect(page.getByRole('link', { name: en.follows.browseDaily })).toHaveAttribute('href', '/en/daily')
    } finally {
      await member.remove()
    }
  })
})
