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

test('the data export is only for signed-in members, from IFAI’s own pages', async ({ request }) => {
  const signedOut = await request.get('/api/account/export')
  expect(signedOut.status()).toBe(401)
  expect(signedOut.headers()['cache-control']).toBe('private, no-store')
  expect((await request.get('/api/account/export', { headers: { 'sec-fetch-site': 'cross-site' } })).status()).toBe(403)
})

test.describe('a signed-in member', () => {
  test.skip(
    !process.env.DATABASE_URI || !process.env.BETTER_AUTH_SECRET,
    'Signs a member in through the database: needs DATABASE_URI and BETTER_AUTH_SECRET, as in CI.',
  )

  test('downloads their data as a JSON file, without sign-in tokens or anyone else’s data', async ({ page, context, baseURL }) => {
    const member = await createMember(baseURL ?? 'http://localhost:3000')
    const other = await createMember(baseURL ?? 'http://localhost:3000', 'Smoke test reviewer')
    let subscriber: number | undefined
    try {
      await member.query(`insert into saves (user_id, target_type, target_id) values ($1, 'app', $2)`, [member.id, nowhere])
      // With the sample stories (CI adds them), a saved story is named and linked in the page language.
      const story = process.env.E2E_SAMPLE_STORIES ? await member.storyId('sample-orbit-notes-benchmark') : null
      if (story !== null) {
        await member.query(`insert into saves (user_id, target_type, target_id, created_at) values ($1, 'story', $2, now() - interval '1 minute')`, [
          member.id,
          story,
        ])
      }
      const review = await member.addReview(nowhere, 'Exported with the rest')
      const otherReview = await other.addReview(nowhere, 'Words of another member')
      await member.query(`insert into app_review_reports (review_id, reporter, reason) values ($1, $2, 'spam')`, [otherReview, `u:${member.id}`])
      // Categories come with the migrations, so the file can name one in any database.
      const coding = (await member.query<{ id: number }>(`select id from app_categories where slug = 'coding'`)).rows[0].id
      await member.query(
        `insert into app_submissions (name, website, email, submitter_id, category_id, reply, admin_note)
         values ('Exported', 'https://exported.example', $1, $2, $3, 'Thanks, we are looking', 'Internal note')`,
        [member.email, member.id, coding],
      )
      await member.query(
        `insert into skill_submissions (repository, email, submitter_id, admin_note) values ('https://github.com/example/exported', $1, $2, 'Internal note')`,
        [member.email, member.id],
      )
      // The daily email goes by address, so it comes along for the verified sign-in email.
      subscriber = (
        await member.query<{ id: number }>(
          `insert into subscribers (email, locale, time_zone, subscribed_at) values ($1, 'ja', 'Asia/Tokyo', now()) returning id`,
          [member.email],
        )
      ).rows[0].id
      await member.query(
        `insert into email_sends (subscriber_id, local_date, locale, status, story_count, resend_id) values ($1, '2026-10-23', 'ja', 'sent', 8, 'provider-id')`,
        [subscriber],
      )
      await context.addCookies([member.cookie])

      await page.goto('/en/me/account')
      await expect(page.getByRole('heading', { name: en.account.exportTitle })).toBeVisible()
      const downloading = page.waitForEvent('download')
      await page.getByRole('button', { name: en.account.exportButton }).click()
      const download = await downloading
      const file = download.suggestedFilename()
      expect(file).toMatch(/^ifai-data-\d{4}-\d{2}-\d{2}\.json$/)
      await expect(page.getByText(en.account.exported.replace('{file}', file))).toBeVisible()

      const text = readFileSync(await download.path(), 'utf8')
      const data = JSON.parse(text)
      expect(data.about).toContain(member.email)
      expect(data.account).toMatchObject({ id: member.id, email: member.email, emailVerified: true })
      expect(data.linkedAccounts).toEqual([])
      expect(data.sessions).toEqual([expect.objectContaining({ current: true })])
      expect(data.saves).toEqual([
        { type: 'app', id: nowhere, name: null, url: null, savedAt: expect.any(String) },
        ...(story === null
          ? []
          : [
              {
                type: 'story',
                id: story,
                name: 'Sample: Orbit Notes reports a new summarization benchmark',
                url: expect.stringMatching(/\/en\/daily\/sample-orbit-notes-benchmark$/),
                savedAt: expect.any(String),
              },
            ]),
      ])
      expect(data.reviews).toEqual([expect.objectContaining({ id: review, text: 'Exported with the rest', rating: 4, status: 'shown' })])
      expect(data.reviewReports).toEqual([expect.objectContaining({ review: otherReview, reason: 'spam' })])
      expect(data.appSubmissions).toEqual([
        expect.objectContaining({
          name: 'Exported',
          category: { id: coding, name: 'Coding', url: expect.stringMatching(/\/en\/apps\/category\/coding$/) },
          replyFromIFAI: 'Thanks, we are looking',
        }),
      ])
      expect(data.skillSubmissions).toEqual([expect.objectContaining({ repository: 'https://github.com/example/exported' })])
      expect(data.dailyEmail).toMatchObject({ email: member.email, status: 'subscribed', language: 'ja', timeZone: 'Asia/Tokyo' })
      expect(data.dailyEmail.emails).toEqual([{ date: '2026-10-23', language: 'ja', status: 'sent', stories: 8, sentAt: null }])

      const [token] = decodeURIComponent(member.cookie.value).split('.')
      for (const kept of [token, 'Internal note', 'provider-id', 'Words of another member', other.id]) expect(text).not.toContain(kept)
    } finally {
      if (subscriber !== undefined) {
        await member.query('delete from email_sends where subscriber_id = $1', [subscriber])
        await member.query('delete from subscribers where id = $1', [subscriber])
      }
      await member.remove()
      await other.remove()
    }
  })

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
