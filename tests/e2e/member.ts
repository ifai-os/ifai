import { createHmac, randomBytes, randomUUID } from 'node:crypto'

import pg from 'pg'

/**
 * A throwaway member who is signed in: a user and a session written straight to the database,
 * and the session cookie Better Auth would have set (the token, signed with BETTER_AUTH_SECRET).
 * Needs DATABASE_URI and BETTER_AUTH_SECRET, the same ones the server uses; CI sets both.
 * `remove()` deletes the member, and with it their sessions and saves.
 */
export async function createMember(baseURL: string) {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URI })
  await client.connect()
  const id = randomUUID()
  const token = randomBytes(24).toString('base64url')
  await client.query(`insert into auth_users (id, name, email, email_verified) values ($1, $2, $3, true)`, [
    id,
    'Smoke test member',
    `smoke-${id}@example.com`,
  ])
  await client.query(`insert into auth_sessions (id, token, user_id, expires_at) values ($1, $2, $3, now() + interval '1 hour')`, [
    randomUUID(),
    token,
    id,
  ])
  const signature = createHmac('sha256', process.env.BETTER_AUTH_SECRET ?? '').update(token).digest('base64')

  return {
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
    async skillId(slug: string): Promise<number> {
      const { rows } = await client.query<{ id: number }>('select id from skills where slug = $1', [slug])
      if (!rows[0]) throw new Error(`No Skill ${slug}; run scripts/seed-skills.ts`)
      return rows[0].id
    },
    async remove() {
      await client.query('delete from auth_users where id = $1', [id])
      await client.end()
    },
  }
}
