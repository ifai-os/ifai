import { readFileSync } from 'node:fs'

import { expect, test } from '@playwright/test'

import type enMessages from '../../messages/en.json'

type Messages = typeof enMessages

const load = (name: string): Messages =>
  JSON.parse(readFileSync(new URL(`../../messages/${name}.json`, import.meta.url), 'utf8')) as Messages

const en = load('en')
const ja = load('ja')
const ko = load('ko')
const zhHans = load('zh-hans')
const zhHant = load('zh-hant')

const homes = [
  { path: '/en', lang: 'en', messages: en },
  { path: '/zh-hans', lang: 'zh-Hans', messages: zhHans },
  { path: '/zh-hant', lang: 'zh-Hant', messages: zhHant },
  { path: '/ja', lang: 'ja', messages: ja },
  { path: '/ko', lang: 'ko', messages: ko },
]

for (const { path, lang, messages } of homes) {
  test(`home page opens in ${lang}`, async ({ page }) => {
    const response = await page.goto(path)
    expect(response?.status()).toBe(200)
    await expect(page.locator('html')).toHaveAttribute('lang', lang)
    await expect(page.getByRole('heading', { level: 1, name: messages.home.todayAI })).toBeVisible()
    const nav = page.getByRole('navigation', { name: messages.nav.label })
    await expect(nav.getByRole('link', { name: messages.nav.daily })).toBeVisible()
    await expect(nav.getByRole('link', { name: messages.nav.apps })).toBeVisible()
    await expect(nav.getByRole('link', { name: messages.nav.resources })).toBeVisible()
  })
}

for (const { path, lang, messages } of homes) {
  test(`privacy policy and terms open from the footer in ${lang}`, async ({ page }) => {
    await page.goto(path)
    const footer = page.locator('footer')
    await footer.getByRole('link', { name: messages.footer.privacy }).click()
    await expect(page).toHaveURL(`${path}/privacy`)
    await expect(page.getByRole('heading', { level: 1, name: messages.legal.privacy.title })).toBeVisible()
    await expect(page.getByRole('heading', { level: 2, name: messages.legal.privacy.sections.collect.title })).toBeVisible()
    await footer.getByRole('link', { name: messages.footer.terms }).click()
    await expect(page).toHaveURL(`${path}/terms`)
    await expect(page.getByRole('heading', { level: 1, name: messages.legal.terms.title })).toBeVisible()
  })
}

test('the root redirects to a locale', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveURL(/\/(en|zh-hans|zh-hant|ja|ko)$/)
})

test('switching language keeps the page and remembers the choice', async ({ page, context }) => {
  await page.goto('/en/apps')
  await page.getByRole('button', { name: en.header.language }).click()
  await page.getByRole('menuitemradio', { name: '简体中文' }).click()
  await expect(page).toHaveURL(/\/zh-hans\/apps$/)
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-Hans')

  const cookies = await context.cookies()
  expect(cookies.find((cookie) => cookie.name === 'IFAI_LOCALE')?.value).toBe('zh-Hans')
})

test('unknown pages return a localized 404', async ({ page }) => {
  const response = await page.goto('/ja/does-not-exist')
  expect(response?.status()).toBe(404)
  await expect(page.getByRole('heading', { level: 1, name: ja.notFound.title })).toBeVisible()
})

test('sign-in page renders', async ({ page }) => {
  await page.goto('/en/sign-in')
  await expect(page.getByRole('heading', { level: 1, name: en.auth.title })).toBeVisible()
})

test('Payload admin is reachable', async ({ page }) => {
  test.skip(!process.env.E2E_ADMIN, 'Needs a database; set E2E_ADMIN=1 where one is available.')
  const response = await page.goto('/admin')
  expect(response?.status()).toBeLessThan(400)
  await expect(page.locator('form')).toBeVisible()
})

test('model usage is for signed-in admins only', async ({ page }) => {
  test.skip(!process.env.E2E_ADMIN, 'Needs a database; set E2E_ADMIN=1 where one is available.')
  await page.goto('/admin/model-usage')
  await expect(page).toHaveURL(/\/admin\/login\?redirect=%2Fmodel-usage/)
  await expect(page.locator('form')).toBeVisible()
})
