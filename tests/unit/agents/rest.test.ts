import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import { locales } from '@/i18n/config'
import type { AgentCaller } from '@/modules/agents/data'
import { readLang } from '@/modules/agents/lang'
import { defineOperation, OperationError } from '@/modules/agents/operations/types'
import { handleRest, matchOperation, methodNotAllowed, methodsAt, preflight, readInput } from '@/modules/agents/rest'

function fake(path: `/${string}`, input: z.ZodObject = z.object({}), method: 'GET' | 'POST' | 'DELETE' = 'GET') {
  return defineOperation({
    name: `${method} ${path}`,
    tool: path,
    title: path,
    description: path,
    module: null,
    ...(method !== 'GET' && { method, auth: 'write' as const }),
    path,
    input,
    run: async () => ({}),
    markdown: () => '',
  })
}

/** An agent whose key the gate has already checked (src/modules/agents/gate.ts). */
const reader: AgentCaller = {
  keyId: 7,
  scope: 'read',
  expiresAt: '2027-01-31T00:00:00.000Z',
  agent: { id: 3, name: 'Scout', about: null },
  owner: { id: 'member-1', name: 'Mei' },
}
const writer: AgentCaller = { ...reader, keyId: 8, scope: 'write' }

afterEach(() => vi.unstubAllEnvs())

describe('matchOperation', () => {
  const operations = [
    fake('/news'),
    fake('/news/{slug}', z.object({ slug: z.string() })),
    fake('/news/trending'),
    fake('/news/topic/{key}', z.object({ key: z.string() })),
  ]

  it('prefers fixed segments to parameters', () => {
    expect(matchOperation(operations, ['news', 'trending'])?.operation.path).toBe('/news/trending')
    expect(matchOperation(operations, ['news', 'gpt-6'])).toMatchObject({ operation: { path: '/news/{slug}' }, params: { slug: 'gpt-6' } })
    expect(matchOperation(operations, ['news', 'topic', 'openai'])?.params).toEqual({ key: 'openai' })
  })

  it('finds nothing for other paths', () => {
    expect(matchOperation(operations, ['news', 'a', 'b'])).toBeNull()
    expect(matchOperation(operations, ['apps'])).toBeNull()
    expect(matchOperation(operations, [])).toBeNull()
  })

  it('goes by the method too', () => {
    const both = [fake('/posts'), fake('/posts', z.object({}), 'POST'), fake('/posts/{id}', z.object({ id: z.number() }), 'DELETE')]
    expect(matchOperation(both, ['posts'])?.operation.name).toBe('GET /posts')
    expect(matchOperation(both, ['posts'], 'POST')?.operation.name).toBe('POST /posts')
    expect(matchOperation(both, ['posts', '3'], 'DELETE')?.params).toEqual({ id: '3' })
    expect(matchOperation(both, ['posts', '3'])).toBeNull()
    expect(methodsAt(both, ['posts'])).toEqual(['GET', 'POST'])
    expect(methodsAt(both, ['posts', '3'])).toEqual(['DELETE'])
  })
})

describe('readInput', () => {
  const operation = fake(
    '/things/{id}',
    z.object({
      id: z.number().int(),
      lang: z.enum(locales).default('en'),
      page: z.number().int().default(1),
      certified: z.boolean().default(false),
      q: z.string().optional(),
      since: z.union([z.iso.datetime(), z.iso.date()]).optional(),
    }),
  )

  it('reads numbers and booleans from the address, and the language in any usual spelling', () => {
    const input = readInput(operation, { id: '7' }, new URLSearchParams('page=2&certified=true&q=12&lang=zh-TW&since=2026-11-01&other=1'))
    expect(input).toEqual({ id: 7, page: 2, certified: true, q: '12', lang: 'zh-Hant', since: '2026-11-01' })
    expect(operation.input.parse(input)).toEqual(input)
  })

  it('leaves what does not read as a number for the schema to refuse', () => {
    const input = readInput(operation, { id: 'abc' }, new URLSearchParams('page=two'))
    expect(input).toMatchObject({ id: 'abc', page: 'two', lang: 'en' })
    expect(operation.input.safeParse(input).success).toBe(false)
  })

  it('refuses a parameter given twice and a language IFAI does not have', () => {
    expect(() => readInput(operation, { id: '1' }, new URLSearchParams('page=1&page=2'))).toThrow(OperationError)
    expect(() => readInput(operation, { id: '1' }, new URLSearchParams('lang=fr'))).toThrow(/lang/)
  })

  it('takes a JSON body as it is, after the path and before the query string', () => {
    const input = readInput(operation, { id: '7' }, new URLSearchParams('page=3&q=from-query'), { id: 99, page: '2', certified: true, lang: 'ja' })
    expect(input).toEqual({ id: 7, page: '2', certified: true, q: 'from-query', lang: 'ja' })
    // A body keeps JSON's types: "2" is not a number there, so the schema refuses it.
    expect(operation.input.safeParse(input).success).toBe(false)
  })
})

describe('readLang', () => {
  it('takes the site’s languages in any case and the usual short forms', () => {
    expect(readLang(undefined)).toBe('en')
    expect(readLang('')).toBe('en')
    expect(readLang('ZH-hans')).toBe('zh-Hans')
    expect(readLang('zh_CN')).toBe('zh-Hans')
    expect(readLang('zh')).toBe('zh-Hans')
    expect(readLang('zh-HK')).toBe('zh-Hant')
    expect(readLang('ja-JP')).toBe('ja')
    expect(readLang('fr')).toBeNull()
    expect(readLang(3)).toBeNull()
  })
})

describe('handleRest', () => {
  const get = (path: string, headers: Record<string, string> = {}) => handleRest(new Request(`http://localhost:3000${path}`, { headers }))

  it('lists the endpoints at /api/v1, for anyone and any site', async () => {
    const response = await get('/api/v1')
    expect(response.status).toBe(200)
    const body = (await response.json()) as { endpoints: { tool: string; path: string }[] }
    expect(body.endpoints).toContainEqual(expect.objectContaining({ tool: 'list_news', path: '/api/v1/news' }))
    expect(response.headers.get('cache-control')).toBe('public, max-age=0, s-maxage=60, stale-while-revalidate=300')
    expect(response.headers.get('access-control-allow-origin')).toBe('*')
    expect(response.headers.get('x-robots-tag')).toBe('noindex')
  })

  it('serves the OpenAPI document of the same operations', async () => {
    const body = (await (await get('/api/v1/openapi.json')).json()) as {
      openapi: string
      paths: Record<string, { get: { operationId: string; parameters: { name: string; in: string; required: boolean }[] } }>
    }
    expect(body.openapi).toBe('3.1.0')
    expect(body.paths['/news/{slug}'].get.operationId).toBe('news.read')
    expect(body.paths['/news/{slug}'].get.parameters).toContainEqual(expect.objectContaining({ name: 'slug', in: 'path', required: true }))
    expect(body.paths['/search'].get.parameters).toContainEqual(expect.objectContaining({ name: 'q', in: 'query', required: true }))
  })

  it('answers 404 for other addresses and 400 for parameters it cannot use', async () => {
    const notFound = await get('/api/v1/nope')
    expect(notFound.status).toBe(404)
    expect(await notFound.json()).toMatchObject({ error: { code: 'not_found' } })
    for (const [path, words] of [
      ['/api/v1/news?limit=500', /limit/],
      ['/api/v1/news?lang=fr', /lang/],
      ['/api/v1/news?format=xml', /format/],
      ['/api/v1/news?since=yesterday', /since/],
      ['/api/v1/search', /q/],
      ['/api/v1/apps/Not%20A%20Slug', /slug/],
    ] as const) {
      const response = await get(path)
      expect(response.status, path).toBe(400)
      expect(((await response.json()) as { error: { message: string } }).error.message, path).toMatch(words)
    }
  })

  it('keeps answers to requests that carry a key out of shared caches', async () => {
    const response = await get('/api/v1', { authorization: 'Bearer ifai_x' })
    expect(response.headers.get('cache-control')).toBe('private, no-store')
  })

  it('reads with GET and writes with POST or DELETE', async () => {
    const refused = methodNotAllowed()
    expect(refused.status).toBe(405)
    expect(refused.headers.get('allow')).toBe('GET, HEAD, POST, DELETE, OPTIONS')
    const allowed = preflight()
    expect(allowed.status).toBe(204)
    expect(allowed.headers.get('access-control-allow-methods')).toBe('GET, HEAD, POST, DELETE, OPTIONS')
    expect(allowed.headers.get('access-control-allow-headers')).toBe('Authorization, Content-Type')
  })
})

describe('handleRest, writing', () => {
  const send = (method: string, path: string, caller: AgentCaller | null = null, body?: string) =>
    handleRest(new Request(`http://localhost:3000${path}`, { method, body, headers: body === undefined ? {} : { 'content-type': 'application/json' } }), caller)
  const error = async (response: Response) => ((await response.json()) as { error: { code: string; message: string } }).error

  it('lists what writes, and what needs a key', async () => {
    const body = (await (await send('GET', '/api/v1')).json()) as { endpoints: Record<string, unknown>[] }
    expect(body.endpoints).toContainEqual({ method: 'POST', path: '/api/v1/saves', tool: 'save', title: 'Save for your owner', needsKey: true, writes: true })
    expect(body.endpoints).toContainEqual(expect.objectContaining({ method: 'GET', path: '/api/v1/me', tool: 'whoami', needsKey: true }))
    expect(body.endpoints.find((endpoint) => endpoint.tool === 'whoami')).not.toHaveProperty('writes')
  })

  it('describes each write’s JSON body and the key it needs in the OpenAPI document', async () => {
    type Operation = { requestBody?: { content: { 'application/json': { schema: { properties: Record<string, unknown>; required?: string[] } } } }; parameters: { name: string }[]; security: unknown[]; responses: Record<string, unknown> }
    const body = (await (await send('GET', '/api/v1/openapi.json')).json()) as { paths: Record<string, Record<string, Operation>> }
    const save = body.paths['/saves'].post
    expect(Object.keys(save.requestBody?.content['application/json'].schema.properties ?? {})).toEqual(['type', 'slug', 'saved', 'lang'])
    expect(save.requestBody?.content['application/json'].schema.required).toEqual(['type', 'slug'])
    expect(save.parameters.map((parameter) => parameter.name)).toEqual(['format'])
    expect(save.security).toEqual([{ ifaiKey: [] }])
    expect(Object.keys(save.responses)).toEqual(expect.arrayContaining(['200', '401', '403', '409', '429', '503']))
    // Reading works with or without a key, and has no body.
    expect(body.paths['/news'].get.security).toEqual([{}, { ifaiKey: [] }])
    expect(body.paths['/news'].get.requestBody).toBeUndefined()
    expect(body.paths['/news'].get.responses).not.toHaveProperty('403')
  })

  it('says which methods a path takes', async () => {
    const write = await send('GET', '/api/v1/saves')
    expect(write.status).toBe(405)
    expect(write.headers.get('allow')).toBe('POST, OPTIONS')
    expect(await error(write)).toMatchObject({ code: 'method_not_allowed', message: 'Use POST here.' })
    const read = await send('POST', '/api/v1/news', writer, '{}')
    expect(read.status).toBe(405)
    expect(read.headers.get('allow')).toBe('GET, HEAD, OPTIONS')
    expect((await send('DELETE', '/api/v1/openapi.json', writer)).status).toBe(405)
    expect((await send('PUT', '/api/v1/saves', writer, '{}')).headers.get('allow')).toBe('GET, HEAD, POST, DELETE, OPTIONS')
  })

  it('needs a key that can write, while IFAI lets agents write', async () => {
    const body = JSON.stringify({ type: 'app', slug: 'chatgpt' })
    const missing = await send('POST', '/api/v1/saves', null, body)
    expect(missing.status).toBe(401)
    expect(missing.headers.get('www-authenticate')).toBe('Bearer realm="IFAI"')

    vi.stubEnv('AGENT_WRITES_ENABLED', 'true')
    const readOnly = await send('POST', '/api/v1/saves', reader, body)
    expect(readOnly.status).toBe(403)
    expect(await error(readOnly)).toMatchObject({ code: 'forbidden', message: expect.stringContaining('/me/account?section=agents') })
    expect(readOnly.headers.get('cache-control')).toBe('private, no-store')

    vi.stubEnv('AGENT_WRITES_ENABLED', 'false')
    const paused = await send('POST', '/api/v1/saves', writer, body)
    expect(paused.status).toBe(503)
    expect(await error(paused)).toMatchObject({ code: 'unavailable' })
  })

  it('refuses a body that is not a JSON object, or does not fit, before writing anything', async () => {
    vi.stubEnv('AGENT_WRITES_ENABLED', 'true')
    for (const [body, words] of [
      ['not json', /JSON object/],
      ['[1, 2]', /JSON object/],
      ['"app"', /JSON object/],
      [JSON.stringify({ type: 'app' }), /slug/],
      [JSON.stringify({ type: 'person', slug: 'mei' }), /type/],
      [JSON.stringify({ type: 'app', slug: 'chatgpt', saved: 'yes' }), /saved/],
      [`{"type":"app","slug":"${'a'.repeat(70 * 1024)}"}`, /too large/],
    ] as const) {
      const response = await send('POST', '/api/v1/saves', writer, body)
      expect(response.status, body.slice(0, 40)).toBe(400)
      expect((await error(response)).message, body.slice(0, 40)).toMatch(words)
    }
  })
})
