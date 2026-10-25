import { createHmac, randomBytes, randomUUID } from 'node:crypto'

import pg from 'pg'

/**
 * A throwaway member who is signed in: a user and a session written straight to the database,
 * and the session cookie Better Auth would have set (the token, signed with BETTER_AUTH_SECRET).
 * Needs DATABASE_URI and BETTER_AUTH_SECRET, the same ones the server uses; CI sets both.
 * `remove()` deletes the member, and with it their sessions, saves, follows, reviews (and their translations), and Skill and app submissions.
 */
export async function createMember(baseURL: string, name = 'Smoke test member', { signedInHoursAgo = 0 } = {}) {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URI })
  await client.connect()
  const id = randomUUID()
  const token = randomBytes(24).toString('base64url')
  await client.query(`insert into auth_users (id, name, email, email_verified) values ($1, $2, $3, true)`, [
    id,
    name,
    `smoke-${id}@example.com`,
  ])
  // `created_at` is when they signed in: deleting the account wants a sign-in from the last day.
  await client.query(
    `insert into auth_sessions (id, token, user_id, expires_at, created_at) values ($1, $2, $3, now() + interval '1 hour', now() - make_interval(hours => $4))`,
    [randomUUID(), token, id, signedInHoursAgo],
  )
  const signature = createHmac('sha256', process.env.BETTER_AUTH_SECRET ?? '').update(token).digest('base64')

  return {
    id,
    email: `smoke-${id}@example.com`,
    cookie: {
      name: 'better-auth.session_token',
      value: encodeURIComponent(`${token}.${signature}`),
      url: baseURL,
      httpOnly: true,
      sameSite: 'Lax' as const,
    },
    async appId(slug: string): Promise<number> {
      const { rows } = await client.query<{ id: number }>('select id from apps where slug = $1', [slug])
      if (!rows[0]) throw new Error(`No app ${slug}; run scripts/seed-apps.ts`)
      return rows[0].id
    },
    async storyId(slug: string): Promise<number> {
      const { rows } = await client.query<{ id: number }>('select id from stories where slug = $1', [slug])
      if (!rows[0]) throw new Error(`No story ${slug}; run scripts/seed-stories.ts`)
      return rows[0].id
    },
    async skillId(slug: string): Promise<number> {
      const { rows } = await client.query<{ id: number }>('select id from skills where slug = $1', [slug])
      if (!rows[0]) throw new Error(`No Skill ${slug}; run scripts/seed-skills.ts`)
      return rows[0].id
    },
    /** A review of the app written straight to the table, as if the member had just written it. */
    async addReview(appId: number, body: string, rating = 4, lang = 'en'): Promise<number> {
      const { rows } = await client.query<{ id: number }>(
        `insert into app_reviews (app_id, user_id, rating, body, lang) values ($1, $2, $3, $4, $5) returning id`,
        [appId, id, rating, body, lang],
      )
      return rows[0].id
    },
    /** Machine translations of one of their reviews, stored as the translation job stores them. */
    async addTranslations(reviewId: number, texts: Record<string, string>): Promise<void> {
      await client.query(
        `insert into app_review_translations (review_id, source, status, language, texts, model)
         select id, body, 'done', lang, $2, 'smoke test' from app_reviews where id = $1`,
        [reviewId, JSON.stringify(texts)],
      )
    },
    /** Runs a query on the test database, for setting up rows and checking what is left. */
    query: client.query.bind(client) as pg.Client['query'],
    async remove() {
      // Submissions keep the account id as text, not a foreign key, so they go first.
      await client.query('delete from skill_submissions where submitter_id = $1', [id])
      await client.query('delete from app_submissions where submitter_id = $1', [id])
      await client.query('delete from auth_users where id = $1', [id])
      await client.end()
    },
  }
}
