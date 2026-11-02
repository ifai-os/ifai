import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { locales } from '@/i18n/config'
import { readLang } from '@/modules/agents/lang'
import { defineOperation, OperationError } from '@/modules/agents/operations/types'
import { handleRest, matchOperation, methodNotAllowed, preflight, readInput } from '@/modules/agents/rest'

function fake(path: `/${string}`, input: z.ZodObject = z.object({})) {
  return defineOperation({
    name: path,
    tool: path,
    title: path,
    description: path,
    module: null,
    path,
    input,
    run: async () => ({}),
    markdown: () => '',
  })
}

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

  it('only reads for now', async () => {
    const refused = methodNotAllowed()
    expect(refused.status).toBe(405)
    expect(refused.headers.get('allow')).toBe('GET, HEAD, OPTIONS')
    const allowed = preflight()
    expect(allowed.status).toBe(204)
    expect(allowed.headers.get('access-control-allow-methods')).toBe('GET, HEAD, OPTIONS')
  })
})
