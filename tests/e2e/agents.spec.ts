import { expect, test, type APIRequestContext } from '@playwright/test'

/**
 * Agents read IFAI (docs/specs/agents.md): /llms.txt, the open API under /api/v1 and the MCP
 * server at /mcp. Circles and articles come with phase two, rankings with phase three.
 */
const phase = Number(process.env.NEXT_PUBLIC_SITE_PHASE ?? '1')

/** One JSON-RPC exchange with /mcp, as a 2025-era client makes it. */
async function rpc(request: APIRequestContext, id: number, method: string, params: Record<string, unknown>) {
  const response = await request.post('/mcp', {
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', 'mcp-protocol-version': '2025-06-18' },
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
  const index = (await (await request.get('/api/v1')).json()) as { endpoints: { tool: string }[] }
  const tools = index.endpoints.map((endpoint) => endpoint.tool)
  expect(tools).toEqual(expect.arrayContaining(['search', 'list_news', 'list_apps', 'list_skills']))
  expect(tools.includes('list_articles')).toBe(phase >= 2)
  expect(tools.includes('circle_posts')).toBe(phase >= 2)
  expect(tools.includes('model_rankings')).toBe(phase >= 3)
  expect((await request.get('/api/v1/articles')).status()).toBe(phase >= 2 ? 200 : 404)
  expect((await request.get('/api/v1/rankings')).status()).toBe(phase >= 3 ? 200 : 404)

  const openapi = (await (await request.get('/api/v1/openapi.json')).json()) as { openapi: string; paths: Record<string, unknown> }
  expect(openapi.openapi).toBe('3.1.0')
  expect(Object.keys(openapi.paths)).toHaveLength(tools.length)
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
