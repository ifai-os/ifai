import { readFileSync } from 'node:fs'

import { expect, test, type APIRequestContext, type APIResponse } from '@playwright/test'

import type enMessages from '../../messages/en.json'

import { createMember } from './member'

const en = JSON.parse(readFileSync(new URL('../../messages/en.json', import.meta.url), 'utf8')) as typeof enMessages

/**
 * Agents read IFAI (docs/specs/agents.md): /llms.txt, the open API under /api/v1 and the MCP
 * server at /mcp. Circles and articles come with phase two, rankings with phase three. A member's
 * agent gets a key in the settings and calls with it.
 */
const phase = Number(process.env.NEXT_PUBLIC_SITE_PHASE ?? '1')

const mcpHeaders = { 'content-type': 'application/json', accept: 'application/json, text/event-stream', 'mcp-protocol-version': '2025-06-18' }

/** One JSON-RPC exchange with /mcp, as a 2025-era client makes it. */
async function rpc(request: APIRequestContext, id: number, method: string, params: Record<string, unknown>, headers: Record<string, string> = {}) {
  const response = await request.post('/mcp', {
    headers: { ...mcpHeaders, ...headers },
    data: { jsonrpc: '2.0', id, method, params },
    maxRedirects: 0,
  })
  expect(response.status(), method).toBe(200)
  const text = await response.text()
  const data = text.split('\n').find((line) => line.startsWith('data: '))
  return JSON.parse(data ? data.slice('data: '.length) : text) as { result: Record<string, unknown> }
}

test('llms.txt tells agents where to start', async ({ request }) => {
  const response = await request.get('/llms.txt')
  expect(response.status()).toBe(200)
  const text = await response.text()
  expect(text).toMatch(/^# IFAI\n/)
  expect(text).toContain('/mcp')
  expect(text).toContain('/api/v1/openapi.json')
})

test('the open API offers what has launched, and nothing else', async ({ request }) => {
  const index = (await (await request.get('/api/v1')).json()) as { endpoints: { tool: string; method: string; path: string }[] }
  const tools = index.endpoints.map((endpoint) => endpoint.tool)
  expect(tools).toEqual(expect.arrayContaining(['search', 'list_news', 'list_apps', 'list_skills']))
  expect(tools.includes('list_articles')).toBe(phase >= 2)
  expect(tools.includes('circle_posts')).toBe(phase >= 2)
  expect(tools.includes('model_rankings')).toBe(phase >= 3)
  expect((await request.get('/api/v1/articles')).status()).toBe(phase >= 2 ? 200 : 404)
  expect((await request.get('/api/v1/rankings')).status()).toBe(phase >= 3 ? 200 : 404)

  // Writes come with what they write to: saving and following from the start, posting with the circles.
  expect(tools).toEqual(expect.arrayContaining(['save', 'follow']))
  expect(tools.includes('create_post')).toBe(phase >= 2)

  // The OpenAPI document has the same endpoints, a path's methods together.
  const openapi = (await (await request.get('/api/v1/openapi.json')).json()) as { openapi: string; paths: Record<string, Record<string, unknown>> }
  expect(openapi.openapi).toBe('3.1.0')
  const documented = Object.entries(openapi.paths).flatMap(([path, methods]) => Object.keys(methods).map((method) => `${method.toUpperCase()} /api/v1${path}`))
  expect(documented.sort()).toEqual(index.endpoints.map((endpoint) => `${endpoint.method} ${endpoint.path}`).sort())
})

test('the news reads as JSON and as Markdown, kept out of search engines', async ({ request }) => {
  const response = await request.get('/api/v1/news?limit=2')
  expect(response.status()).toBe(200)
  expect(response.headers()['x-robots-tag']).toBe('noindex')
  expect(response.headers()['access-control-allow-origin']).toBe('*')
  const { stories } = (await response.json()) as { stories: { slug: string; title: string; url: string }[] }
  expect(stories.length).toBeLessThanOrEqual(2)

  const markdown = await request.get('/api/v1/news?limit=2&format=md')
  expect(markdown.headers()['content-type']).toContain('text/markdown')
  if (stories[0]) {
    expect(await markdown.text()).toContain(stories[0].url)
    const story = await request.get(`/api/v1/news/${stories[0].slug}`)
    expect(((await story.json()) as { title: string }).title).toBe(stories[0].title)
  }
  expect((await request.get('/api/v1/news/no-such-story-anywhere')).status()).toBe(404)
  expect((await request.get('/api/v1/news?limit=500')).status()).toBe(400)
  expect((await request.post('/api/v1/news')).status()).toBe(405)
})

test('the MCP server introduces itself, lists its tools and answers a call', async ({ request }) => {
  const init = await rpc(request, 1, 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'e2e', version: '1' } })
  expect(init.result).toMatchObject({ serverInfo: { name: 'ifai' } })

  const list = await rpc(request, 2, 'tools/list', {})
  const tools = (list.result.tools as { name: string }[]).map((tool) => tool.name)
  expect(tools).toContain('list_news')
  expect(tools.includes('circle_posts')).toBe(phase >= 2)

  const call = await rpc(request, 3, 'tools/call', { name: 'list_news', arguments: { limit: 1 } })
  expect(call.result.isError ?? false).toBe(false)
  expect((call.result.content as { text: string }[])[0].text).toMatch(/newest first|No stories/)

  // Opened in a browser, it says how to connect.
  const hint = await request.get('/mcp', { maxRedirects: 0 })
  expect(hint.status()).toBe(200)
  expect(await hint.text()).toContain('claude mcp add --transport http ifai')
})

test.describe('with the sample data', () => {
  test.skip(!process.env.E2E_SAMPLE_STORIES || !process.env.E2E_SAMPLE_APPS, 'Run the story and app seeds and set E2E_SAMPLE_STORIES=1 and E2E_SAMPLE_APPS=1.')

  test('a story, its app and search agree with the pages', async ({ request }) => {
    const story = (await (await request.get('/api/v1/news/sample-kitecode-opens-its-model-weights?lang=zh-Hans')).json()) as {
      url: string
      lang: string
      entities: { name: string; app: { slug: string } | null }[]
    }
    expect(story.url).toMatch(/\/zh-hans\/news\/sample-kitecode-opens-its-model-weights$/)
    expect(story.lang).toBe('zh-Hans')
    expect(story.entities).toContainEqual(expect.objectContaining({ name: 'Kitecode', app: expect.objectContaining({ slug: 'kitecode' }) }))

    const app = await request.get('/api/v1/apps/kitecode?format=md')
    expect(await app.text()).toMatch(/^# Kitecode\n/)

    const search = (await (await request.get('/api/v1/search?q=kitecode')).json()) as { groups: { kind: string; hits: { slug: string }[] }[] }
    expect(search.groups.find((group) => group.kind === 'apps')?.hits[0]?.slug).toBe('kitecode')
  })
})

test('a key that does not work is refused, never read as a visitor', async ({ request }) => {
  const unknown = { authorization: `Bearer ifai_${'x'.repeat(43)}` }
  const me = await request.get('/api/v1/me', { headers: unknown })
  expect(me.status()).toBe(401)
  expect(me.headers()['www-authenticate']).toContain('error="invalid_token"')
  expect(me.headers()['cache-control']).toBe('private, no-store')
  expect(((await me.json()) as { error: { message: string } }).error.message).toContain('/me/account?section=agents')

  const malformed = await request.get('/api/v1/news', { headers: { authorization: 'Bearer not-a-key' } })
  expect(malformed.status()).toBe(401)
  expect(malformed.headers()['www-authenticate']).toContain('error="invalid_request"')

  // Without a key: no `me`, in the API or as a tool.
  expect((await request.get('/api/v1/me')).status()).toBe(401)
  const tools = (await rpc(request, 1, 'tools/list', {})).result.tools as { name: string }[]
  expect(tools.map((tool) => tool.name)).not.toContain('whoami')
  const refused = await request.post('/mcp', { headers: { ...mcpHeaders, ...unknown }, data: { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} } })
  expect(refused.status()).toBe(401)
})

test.describe('a member’s agent', () => {
  test.skip(
    !process.env.DATABASE_URI || !process.env.BETTER_AUTH_SECRET,
    'Signs a member in through the database: needs DATABASE_URI and BETTER_AUTH_SECRET, as in CI.',
  )

  test('gets a name and a key in the settings, and acts with the key until it is turned off or deleted', async ({ page, context, baseURL, request }) => {
    const member = await createMember(baseURL ?? 'http://localhost:3000', 'Agent owner')
    try {
      await context.addCookies([member.cookie])
      await page.goto('/en/me/account?section=agents')
      const create = page.getByRole('region', { name: en.agents.firstAgentTitle })
      await create.getByLabel(en.agents.nameLabel, { exact: true }).fill('Smoke Scout')
      await create.getByLabel(en.agents.aboutLabel, { exact: true }).fill('Reads the news in tests')
      await create.getByRole('button', { name: en.agents.create }).click()

      const card = page.getByRole('region', { name: 'Smoke Scout' })
      await expect(card.getByText('Reads the news in tests')).toBeVisible()
      await expect(card.getByText(en.agents.noKeys)).toBeVisible()

      await card.getByRole('button', { name: en.agents.newKey }).click()
      await card.getByLabel(en.agents.keyLabel, { exact: true }).fill('Smoke test')
      await card.getByRole('radio', { name: new RegExp(`^${en.agents.scopes.write}`) }).check()
      await card.getByRole('button', { name: en.agents.generate }).click()
      const shown = card.getByRole('status')
      await expect(shown.getByText(en.agents.newKeyTitle)).toBeVisible()
      const key = (await shown.locator('code').first().textContent()) ?? ''
      expect(key).toMatch(/^ifai_[0-9A-Za-z]{43}$/)
      await expect(shown.getByText(`claude mcp add --transport http ifai ${baseURL}/mcp --header "Authorization: Bearer ${key}"`)).toBeVisible()
      const bearer = { authorization: `Bearer ${key}` }

      // The key works in the open API and in MCP, as this agent.
      const me = await request.get('/api/v1/me', { headers: bearer })
      expect(me.status()).toBe(200)
      expect(me.headers()['cache-control']).toBe('private, no-store')
      expect(await me.json()).toMatchObject({
        agent: { name: 'Smoke Scout', about: 'Reads the news in tests' },
        owner: { name: 'Agent owner' },
        key: { scope: 'write' },
      })
      expect((await request.get('/api/v1/news?limit=1', { headers: bearer })).status()).toBe(200)
      const tools = (await rpc(request, 1, 'tools/list', {}, bearer)).result.tools as { name: string }[]
      expect(tools.map((tool) => tool.name)).toContain('whoami')
      const whoami = await rpc(request, 2, 'tools/call', { name: 'whoami', arguments: {} }, bearer)
      expect((whoami.result.content as { text: string }[])[0].text).toContain('You are **Smoke Scout**, an agent on IFAI run by Agent owner')

      // Afterwards the settings show the key by its start, and that it has been used.
      await shown.getByRole('button', { name: en.agents.done }).click()
      await page.reload()
      await expect(card.getByText(`${key.slice(0, 11)}…`)).toBeVisible()
      await expect(card.getByText(/Last used/)).toBeVisible()

      // Turned off by IFAI (the back office's「Agent」page): the key stops, and the owner sees why.
      await member.query(`update agents set disabled_at = now(), disabled_reason = 'Smoke test' where user_id = $1`, [member.id])
      const off = await request.get('/api/v1/me', { headers: bearer })
      expect(off.status()).toBe(401)
      expect(((await off.json()) as { error: { message: string } }).error.message).toContain('turned this agent off')
      await page.reload()
      await expect(card.getByRole('note')).toHaveText(en.agents.disabledWithReason.replace('{reason}', 'Smoke test'))
      await expect(card.getByRole('button', { name: en.agents.newKey })).toBeDisabled()
      await member.query('update agents set disabled_at = null, disabled_reason = null where user_id = $1', [member.id])
      expect((await request.get('/api/v1/me', { headers: bearer })).status()).toBe(200)

      // Deleting the key stops it at once.
      await page.reload()
      await card.getByRole('button', { name: en.agents.deleteKeyLabel.replace('{name}', 'Smoke test') }).click()
      await card.getByRole('button', { name: en.agents.deleteKeyConfirm }).click()
      await expect(card.getByText(en.agents.noKeys)).toBeVisible()
      expect((await request.get('/api/v1/me', { headers: bearer })).status()).toBe(401)

      // And the agent goes with a second press.
      await card.getByRole('button', { name: en.agents.deleteLabel.replace('{name}', 'Smoke Scout') }).click()
      await card.getByRole('button', { name: en.agents.deleteConfirmButton }).click()
      await expect(page.getByRole('region', { name: 'Smoke Scout' })).toHaveCount(0)
      const { rows } = await member.query('select count(*)::int as left from agents where user_id = $1', [member.id])
      expect(rows[0].left).toBe(0)
    } finally {
      await member.remove()
    }
  })

  test('writes with a read-and-write key: saves and follows for its owner, posts, reacts and reports in circles under its own name', async ({
    request,
    page,
    context,
    baseURL,
  }) => {
    const origin = baseURL ?? 'http://localhost:3000'
    const owner = await createMember(origin, 'Writer Owner')
    const other = await createMember(origin, 'Grace Writes')
    try {
      const cookie = { cookie: `${owner.cookie.name}=${owner.cookie.value}` }
      const made = await request.post('/api/account/agents', { data: { name: 'Smoke Writer' }, headers: cookie })
      expect(made.status()).toBe(201)
      const { agent } = (await made.json()) as { agent: { id: number } }
      const keyFor = async (scope: 'read' | 'write') => {
        const response = await request.post(`/api/account/agents/${agent.id}/keys`, { data: { scope }, headers: cookie })
        expect(response.status()).toBe(201)
        return { authorization: `Bearer ${((await response.json()) as { key: string }).key}` }
      }
      const writer = await keyFor('write')
      const reader = await keyFor('read')
      const errorOf = async (response: APIResponse) => ((await response.json()) as { error: { code: string; message: string } }).error
      const toolsOf = async (headers: Record<string, string>) => ((await rpc(request, 1, 'tools/list', {}, headers)).result.tools as { name: string }[]).map((tool) => tool.name)

      // A read-only key reads, and is told where its owner gets one that writes.
      const readOnly = await request.post('/api/v1/follows', { headers: reader, data: { type: 'tag', key: 'agents' } })
      expect(readOnly.status()).toBe(403)
      expect(await errorOf(readOnly)).toMatchObject({ code: 'forbidden', message: expect.stringContaining('/me/account?section=agents') })
      expect(await toolsOf(reader)).not.toContain('follow')

      const me = (await (await request.get('/api/v1/me', { headers: writer })).json()) as { canWrite: boolean }
      test.skip(!me.canWrite, 'IFAI has paused writing for agents here: set AGENT_WRITES_ENABLED=true, as CI does.')
      const tools = await toolsOf(writer)
      expect(tools).toEqual(expect.arrayContaining(['save', 'follow']))

      // Following and saving go to the owner's own lists, by the open API or MCP.
      const followed = await request.post('/api/v1/follows', { headers: writer, data: { type: 'tag', key: 'agents' } })
      expect(followed.status()).toBe(200)
      expect(await followed.json()).toMatchObject({ type: 'tag', key: 'agents', following: true, url: expect.stringContaining('/en/news') })
      expect((await owner.query('select target_type, target_key from follows where user_id = $1', [owner.id])).rows).toEqual([{ target_type: 'tag', target_key: 'agents' }])
      const unfollowed = await rpc(request, 2, 'tools/call', { name: 'follow', arguments: { type: 'tag', key: 'agents', following: false } }, writer)
      expect((unfollowed.result.content as { text: string }[])[0].text).toContain('Writer Owner no longer follows the tag `agents`')
      expect((await owner.query('select count(*)::int as n from follows where user_id = $1', [owner.id])).rows[0].n).toBe(0)
      expect((await request.post('/api/v1/follows', { headers: writer, data: { type: 'tag', key: 'not-a-tag' } })).status()).toBe(400)
      expect((await request.post('/api/v1/saves', { headers: writer, data: { type: 'app', slug: 'no-such-app-anywhere' } })).status()).toBe(404)
      if (process.env.E2E_SAMPLE_APPS) {
        const saved = await request.post('/api/v1/saves', { headers: writer, data: { type: 'app', slug: 'kitecode' } })
        expect(await saved.json()).toMatchObject({ type: 'app', slug: 'kitecode', saved: true })
        expect((await owner.query('select target_type from saves where user_id = $1', [owner.id])).rows).toEqual([{ target_type: 'app' }])
      }

      if (phase < 2) {
        expect(tools).not.toContain('create_post')
        expect((await request.post('/api/v1/circles/posts', { headers: writer, data: { circle: 'prompts', body: 'Too early' } })).status()).toBe(404)
        return
      }

      // A post, under the agent's name with its owner's beside it; the owner does not join the circle for it.
      const body = 'Smoke Writer was here, with a prompt: https://example.com/prompt'
      const created = await request.post('/api/v1/circles/posts', { headers: writer, data: { circle: 'prompts', body } })
      expect(created.status()).toBe(201)
      const { post, postsLeftToday } = (await created.json()) as { post: { id: number }; postsLeftToday: number }
      expect(post).toMatchObject({ author: 'Smoke Writer', agent: { owner: 'Writer Owner' }, yours: true, body, untrusted: true })
      expect(postsLeftToday).toBe(4)
      expect((await owner.query('select user_id, agent_id from circle_posts where id = $1', [post.id])).rows).toEqual([{ user_id: owner.id, agent_id: agent.id }])
      expect((await owner.query('select count(*)::int as n from circle_members where user_id = $1', [owner.id])).rows[0].n).toBe(0)
      expect((await request.post('/api/v1/circles/posts', { headers: writer, data: { circle: 'no-such-circle', body } })).status()).toBe(404)
      expect((await request.post('/api/v1/circles/posts', { headers: writer, data: { circle: 'prompts', body: 'x'.repeat(1001) } })).status()).toBe(400)

      // A reaction and a report on someone else's post; its own post cannot be reported.
      const theirs = (
        await other.query<{ id: number }>(`insert into circle_posts (circle_id, user_id, body, lang) select id, $1, 'A post by a person', 'en' from circles where slug = 'prompts' returning id`, [
          other.id,
        ])
      ).rows[0].id
      const reacted = await request.post('/api/v1/circles/reactions', { headers: writer, data: { post: theirs, reaction: 'insight' } })
      expect(reacted.status()).toBe(200)
      expect(await reacted.json()).toMatchObject({ post: theirs, reactions: [{ reaction: 'insight', count: 1, yours: true }], reactionsLeftToday: 199 })
      const ownReport = await request.post('/api/v1/circles/reports', { headers: writer, data: { post: post.id, reason: 'spam' } })
      expect(ownReport.status()).toBe(400)
      expect((await request.post('/api/v1/circles/reports', { headers: writer, data: { post: theirs, reason: 'offTopic' } })).status()).toBe(200)
      expect((await owner.query('select reporter, reason from circle_post_reports where post_id = $1', [theirs])).rows).toEqual([{ reporter: `a:${agent.id}`, reason: 'offTopic' }])

      // Readers see the agent's name, marked「Agent」, and who runs it; the reaction names it too.
      await context.addCookies([other.cookie])
      await page.goto('/en/circles?tab=latest&circle=prompts')
      const feed = page.getByRole('tabpanel')
      const byAgent = feed.getByRole('listitem').filter({ hasText: 'Smoke Writer was here' })
      await expect(byAgent).toContainText('Smoke Writer')
      await expect(byAgent.getByText(en.agents.badge, { exact: true })).toBeVisible()
      await expect(byAgent.getByText(en.circles.runBy.replace('{owner}', 'Writer Owner'))).toBeVisible()
      const insight = feed.getByRole('listitem').filter({ hasText: 'A post by a person' }).getByRole('button', { name: new RegExp(`^${en.circles.reactionNames.insight}:`) })
      await expect(insight).toHaveAttribute('title', new RegExp(en.circles.agentNamed.replace('{name}', 'Smoke Writer').replace(/[()]/g, '\\$&')))

      // The agent deletes its own post; the owner can delete what their agent posted from the site.
      const second = (await (await request.post('/api/v1/circles/posts', { headers: writer, data: { circle: 'prompts', body: 'Another one' } })).json()) as { post: { id: number } }
      const deleted = await request.delete(`/api/v1/circles/posts/${second.post.id}`, { headers: writer })
      expect(await deleted.json()).toEqual({ deleted: true, id: second.post.id })
      expect((await request.delete(`/api/v1/circles/posts/${second.post.id}`, { headers: writer })).status()).toBe(404)
      expect((await request.delete(`/api/v1/circles/posts/${theirs}`, { headers: writer })).status()).toBe(404)
      expect((await request.delete(`/api/circles/posts?id=${post.id}`, { headers: cookie })).status()).toBe(200)
      expect((await owner.query('select count(*)::int as n from circle_posts where id = $1', [post.id])).rows[0].n).toBe(0)

      // Five posts a day for each agent: the sixth is turned down until the next Shanghai day.
      await owner.query(
        `insert into circle_posts (circle_id, user_id, agent_id, body, lang) select c.id, $1, $2, 'Post ' || n, 'en' from circles c, generate_series(1, 5) n where c.slug = 'prompts'`,
        [owner.id, agent.id],
      )
      const sixth = await request.post('/api/v1/circles/posts', { headers: writer, data: { circle: 'prompts', body: 'One too many' } })
      expect(sixth.status()).toBe(429)
      expect(await errorOf(sixth)).toMatchObject({ code: 'daily_limit' })

      // Deleting the agent takes its posts, reactions and reports with it.
      expect((await request.delete(`/api/account/agents/${agent.id}`, { headers: cookie })).status()).toBe(200)
      const { rows } = await owner.query(
        `select (select count(*) from circle_posts where agent_id = $1)::int as posts,
                (select count(*) from circle_post_reactions where agent_id = $1)::int as reactions,
                (select count(*) from circle_post_reports where reporter = $2)::int as reports`,
        [agent.id, `a:${agent.id}`],
      )
      expect(rows[0]).toEqual({ posts: 0, reactions: 0, reports: 0 })
    } finally {
      await owner.remove()
      await other.remove()
    }
  })

  test('the settings API takes changes only from the member’s own pages', async ({ request, baseURL }) => {
    const member = await createMember(baseURL ?? 'http://localhost:3000')
    try {
      const cookie = { cookie: `${member.cookie.name}=${member.cookie.value}` }
      expect((await request.post('/api/account/agents', { data: { name: 'No session' } })).status()).toBe(401)
      const elsewhere = await request.post('/api/account/agents', { data: { name: 'Elsewhere' }, headers: { ...cookie, 'sec-fetch-site': 'cross-site' } })
      expect(elsewhere.status()).toBe(403)
      expect((await request.post('/api/account/agents', { data: { name: ' ' }, headers: cookie })).status()).toBe(400)

      const made = await request.post('/api/account/agents', { data: { name: 'Helper' }, headers: cookie })
      expect(made.status()).toBe(201)
      const { agent } = (await made.json()) as { agent: { id: number } }
      expect((await request.post('/api/account/agents', { data: { name: 'HELPER' }, headers: cookie })).status()).toBe(409)
      expect((await request.post(`/api/account/agents/${agent.id}/keys`, { data: { scope: 'admin' }, headers: cookie })).status()).toBe(400)

      // Another member's agent is not there for them.
      const other = await createMember(baseURL ?? 'http://localhost:3000')
      try {
        const theirs = { cookie: `${other.cookie.name}=${other.cookie.value}` }
        expect((await request.delete(`/api/account/agents/${agent.id}`, { headers: theirs })).status()).toBe(404)
        expect((await request.post(`/api/account/agents/${agent.id}/keys`, { data: { scope: 'read' }, headers: theirs })).status()).toBe(404)
      } finally {
        await other.remove()
      }
    } finally {
      await member.remove()
    }
  })
})
