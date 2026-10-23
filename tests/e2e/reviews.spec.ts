import { readFileSync } from 'node:fs'

import { expect, test, type Locator } from '@playwright/test'

import type enMessages from '../../messages/en.json'

import { createMember } from './member'

const en = JSON.parse(readFileSync(new URL('../../messages/en.json', import.meta.url), 'utf8')) as typeof enMessages
const r = en.reviews

/** Presses the star itself, as a reader would; the radio inside it is visually hidden. */
async function pickRating(form: Locator, rating: number) {
  await form
    .locator('label')
    .filter({ has: form.page().getByRole('radio', { name: new RegExp(`^${rating} stars?:`) }) })
    .click()
}

test('the reviews API answers visitors, and only members can write', async ({ request }) => {
  expect((await request.get('/api/reviews?app=abc')).status()).toBe(400)
  const missing = await request.get('/api/reviews?app=2000000000')
  expect(missing.status()).toBe(404)
  expect(missing.headers()['cache-control']).toBe('private, no-store')

  const review = { app: 1, rating: 5, body: 'Great', locale: 'en' }
  expect((await request.post('/api/reviews', { data: review })).status()).toBe(401)
  expect((await request.post('/api/reviews', { data: review, headers: { 'sec-fetch-site': 'cross-site' } })).status()).toBe(403)
  expect((await request.delete('/api/reviews?app=1')).status()).toBe(401)

  expect((await request.post('/api/reviews/report', { data: { review: 1, reason: 'boring' } })).status()).toBe(400)
  expect((await request.post('/api/reviews/report', { data: { review: 2000000000, reason: 'spam' } })).status()).toBe(404)
  const fromElsewhere = await request.post('/api/reviews/report', {
    data: { review: 1, reason: 'spam' },
    headers: { 'sec-fetch-site': 'cross-site' },
  })
  expect(fromElsewhere.status()).toBe(403)
})

// Needs the sample apps from scripts/seed-apps.ts: CI adds them; preview databases don't have them.
test.describe('with the sample apps', () => {
  test.skip(!process.env.E2E_SAMPLE_APPS, 'Run `pnpm payload run scripts/seed-apps.ts` and set E2E_SAMPLE_APPS=1.')

  test('a visitor reads the reviews and is asked to sign in to write one', async ({ page }) => {
    const loaded = page.waitForResponse((response) => /\/api\/reviews\?app=\d+$/.test(response.url()))
    await page.goto('/en/apps/kitecode')
    const response = await loaded
    expect(response.status()).toBe(200)
    expect(response.headers()['cache-control']).toBe('private, no-store')
    expect(await response.json()).toMatchObject({ signedIn: false, mine: null, summary: { count: 0, average: null } })

    const reviews = page.getByRole('region', { name: r.title })
    await expect(reviews.getByText(r.emptyTitle)).toBeVisible()
    await reviews.getByRole('button', { name: r.write }).click()
    const dialog = page.getByRole('dialog', { name: r.signInTitle })
    await expect(dialog).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
  })

  test('a member writes, edits and deletes a review, and reports another', async ({ page, context, baseURL }) => {
    test.skip(
      !process.env.DATABASE_URI || !process.env.BETTER_AUTH_SECRET,
      'Signs members in through the database: needs DATABASE_URI and BETTER_AUTH_SECRET, as in CI.',
    )
    const member = await createMember(baseURL ?? 'http://localhost:3000', 'Ada Reviewer')
    const other = await createMember(baseURL ?? 'http://localhost:3000', 'Grace Reviewer')
    try {
      await other.addReview(await other.appId('orbit-notes'), 'Summaries are short and to the point.', 5)
      await context.addCookies([member.cookie])
      const reviews = page.getByRole('region', { name: r.title })
      const writeTitle = r.writeTitle.replace('{name}', 'Orbit Notes')

      // Back from signing in with ?review=write: the form opens by itself, and the address is cleaned up.
      await page.goto('/en/apps/orbit-notes?review=write')
      const form = page.getByRole('dialog', { name: writeTitle })
      await expect(form).toBeVisible()
      await expect(page).toHaveURL(/\/en\/apps\/orbit-notes$/)
      await expect(form.getByLabel(r.nameLabel)).toHaveValue('Ada Reviewer')

      await form.getByLabel(r.bodyLabel, { exact: true }).fill('Good for reading long articles.')
      await form.getByRole('button', { name: r.publish }).click()
      await expect(form.getByRole('alert')).toHaveText(r.errors.rating)
      await pickRating(form, 4)
      await form.getByRole('button', { name: r.publish }).click()
      await expect(form).toBeHidden()

      // Their own review comes first; under five reviews there is no average yet.
      await expect(reviews.getByText(r.mine, { exact: true })).toBeVisible()
      await expect(reviews.getByText('Good for reading long articles.')).toBeVisible()
      await expect(reviews.getByText('2 reviews', { exact: true })).toBeVisible()
      await expect(reviews.getByText(/^Rated /)).toHaveCount(0)

      // Changing it, and the name shown with it.
      await reviews.getByRole('button', { name: r.edit }).first().click()
      const edit = page.getByRole('dialog', { name: r.editTitle.replace('{name}', 'Orbit Notes') })
      await expect(edit.getByLabel(r.bodyLabel, { exact: true })).toHaveValue('Good for reading long articles.')
      await edit.getByLabel(r.bodyLabel, { exact: true }).fill('Good for reading long articles. Fast, too.')
      await edit.getByLabel(r.nameLabel).fill('Ada L.')
      await edit.getByRole('button', { name: r.save }).click()
      await expect(edit).toBeHidden()
      await expect(reviews.getByText('Good for reading long articles. Fast, too.')).toBeVisible()
      await expect(reviews.getByText('Ada L.', { exact: true })).toBeVisible()
      await expect(reviews.getByText(new RegExp(`· ${r.edited}$`))).toBeVisible()

      // Reporting someone else's.
      await reviews.getByRole('button', { name: r.reportName.replace('{name}', 'Grace Reviewer') }).click()
      const report = page.getByRole('dialog', { name: r.reportTitle })
      await expect(report.getByRole('button', { name: r.reportSend })).toBeDisabled()
      await report.getByLabel(r.reasons.spam).check()
      await report.getByRole('button', { name: r.reportSend }).click()
      await expect(report.getByText(r.reportDone)).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(report).toBeHidden()
      await expect(reviews.getByRole('button', { name: r.reported })).toBeDisabled()

      // Deleting their own, after saying yes.
      await reviews.getByRole('button', { name: r.delete, exact: true }).click()
      await reviews.getByRole('group', { name: r.deleteConfirm }).getByRole('button', { name: r.deleteYes }).click()
      await expect(reviews.getByText(r.mine, { exact: true })).toBeHidden()
      await expect(reviews.getByText('1 review', { exact: true })).toBeVisible()

      // Five new reviews a day at most.
      for (let index = 0; index < 5; index++) await member.addReview(2_000_000_000 + index, 'Written earlier today.')
      await reviews.getByRole('button', { name: r.write }).click()
      const again = page.getByRole('dialog', { name: writeTitle })
      await pickRating(again, 3)
      await again.getByLabel(r.bodyLabel, { exact: true }).fill('One more.')
      await again.getByRole('button', { name: r.publish }).click()
      await expect(again.getByRole('alert')).toHaveText(r.errors.dailyLimit.replace('{limit}', '5'))
    } finally {
      await member.remove()
      await other.remove()
    }
  })
})
