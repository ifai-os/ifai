import { readFileSync } from 'node:fs'

import { expect, test } from '@playwright/test'

import type enMessages from '../../messages/en.json'

import { createMember } from './member'

const en = JSON.parse(readFileSync(new URL('../../messages/en.json', import.meta.url), 'utf8')) as typeof enMessages
const nowhere = 2_000_000_000

test('the account page asks a visitor to sign in and stays out of search', async ({ page }) => {
  const response = await page.goto('/en/me/account')
  expect(response?.status()).toBe(200)
  await expect(page.getByRole('heading', { level: 1, name: en.account.title })).toBeVisible()
  await expect(page.getByText(en.account.signInBody)).toBeVisible()
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/)
})

test.describe('a signed-in member', () => {
  test.skip(
    !process.env.DATABASE_URI || !process.env.BETTER_AUTH_SECRET,
    'Signs a member in through the database: needs DATABASE_URI and BETTER_AUTH_SECRET, as in CI.',
  )

  test('deletes their account, and their saves, reviews, reports and submissions go with it', async ({ page, context, baseURL }) => {
    const member = await createMember(baseURL ?? 'http://localhost:3000')
    const other = await createMember(baseURL ?? 'http://localhost:3000', 'Smoke test reviewer')
    try {
      // On an app id no sample app has, so tests running alongside never see this save or review.
      await member.query(`insert into saves (user_id, target_type, target_id) values ($1, 'app', $2)`, [member.id, nowhere])
      await member.query(`insert into app_reviews (app_id, user_id, rating, body, lang) values ($2, $1, 5, 'Gone soon', 'en')`, [member.id, nowhere])
      await member.query(`insert into app_submissions (name, website, email, submitter_id) values ('Gone', 'https://gone.example', $1, $2)`, [
        member.email,
        member.id,
      ])
      await member.query(`insert into skill_submissions (repository, email, submitter_id) values ('https://github.com/example/gone', $1, $2)`, [
        member.email,
        member.id,
      ])
      // Their report of someone else's review goes; the review stays.
      const otherReview = await other.addReview(nowhere, 'Still here')
      await member.query(`insert into app_review_reports (review_id, reporter, reason) values ($1, $2, 'spam')`, [otherReview, `u:${member.id}`])
      await context.addCookies([member.cookie])

      // From the account menu.
      await page.goto('/en')
      await page.getByRole('button', { name: en.header.account }).click()
      await page.getByRole('link', { name: en.header.accountPage }).click()
      await expect(page).toHaveURL(/\/en\/me\/account$/)
      await expect(page.getByText(member.email)).toBeVisible()

      await page.getByRole('button', { name: en.account.deleteButton }).click()
      const dialog = page.getByRole('dialog', { name: en.account.confirmTitle })
      await expect(dialog).toBeVisible()
      await dialog.getByRole('button', { name: en.account.cancel }).click()
      await expect(dialog).toBeHidden()

      await page.getByRole('button', { name: en.account.deleteButton }).click()
      await dialog.getByRole('button', { name: en.account.confirm }).click()
      await expect(page).toHaveURL(/\/en\/me\/account\?deleted=1$/)
      await expect(page.getByRole('main').getByRole('status')).toHaveText(en.account.deleted)
      await expect(page.getByRole('link', { name: en.header.signIn })).toBeVisible()

      const left = await member.query<Record<string, string>>(
        `select
           (select count(*) from auth_users where id = $1) as users,
           (select count(*) from auth_sessions where user_id = $1) as sessions,
           (select count(*) from saves where user_id = $1) as saves,
           (select count(*) from app_reviews where user_id = $1) as reviews,
           (select count(*) from app_review_reports where reporter = 'u:' || $1) as reports,
           (select count(*) from app_submissions where submitter_id = $1) as apps,
           (select count(*) from skill_submissions where submitter_id = $1) as skills,
           (select count(*) from app_reviews where id = $2) as others`,
        [member.id, otherReview],
      )
      expect(left.rows[0]).toEqual({ users: '0', sessions: '0', saves: '0', reviews: '0', reports: '0', apps: '0', skills: '0', others: '1' })
    } finally {
      await member.remove()
      await other.remove()
    }
  })

  test('signed in more than a day ago, is asked to sign in again first', async ({ page, context, baseURL }) => {
    const member = await createMember(baseURL ?? 'http://localhost:3000', 'Smoke test member', { signedInHoursAgo: 25 })
    try {
      await context.addCookies([member.cookie])
      await page.goto('/en/me/account')
      await page.getByRole('button', { name: en.account.deleteButton }).click()
      const dialog = page.getByRole('dialog', { name: en.account.confirmTitle })
      await dialog.getByRole('button', { name: en.account.confirm }).click()
      await expect(dialog.getByRole('alert')).toHaveText(en.account.signInAgain)
      expect((await member.query('select 1 from auth_users where id = $1', [member.id])).rowCount).toBe(1)

      await dialog.getByRole('button', { name: en.account.signInAgainButton }).click()
      await expect(page.getByText(en.account.signInBody)).toBeVisible()
    } finally {
      await member.remove()
    }
  })
})
