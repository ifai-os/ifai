import { NextRequest } from 'next/server'
import { describe, expect, it } from 'vitest'

import proxy from '@/proxy'

function request(path: string, headers: Record<string, string> = {}) {
  return new NextRequest(new URL(path, 'http://localhost:3000'), { headers })
}

function redirectPath(response: Response) {
  const location = response.headers.get('location')
  return location ? new URL(location).pathname : null
}

describe('locale proxy', () => {
  it.each([
    ['en-US,en;q=0.9', '/en'],
    ['zh-CN,zh;q=0.9', '/zh-hans'],
    ['zh-TW,zh;q=0.9', '/zh-hant'],
    ['zh-HK', '/zh-hant'],
    ['ja-JP', '/ja'],
    ['ko-KR,ko;q=0.9', '/ko'],
    ['fr-FR,fr;q=0.9', '/en'],
  ])('sends a first visit with Accept-Language %s to %s', async (acceptLanguage, expected) => {
    const response = await proxy(request('/', { 'accept-language': acceptLanguage }))
    expect(response.status).toBeGreaterThanOrEqual(300)
    expect(response.status).toBeLessThan(400)
    expect(redirectPath(response)).toBe(expected)
  })

  it('remembers a locale chosen earlier', async () => {
    const response = await proxy(request('/', { 'accept-language': 'en-US', cookie: 'IFAI_LOCALE=ko' }))
    expect(redirectPath(response)).toBe('/ko')
  })

  it('keeps the rest of the path when adding a prefix', async () => {
    const response = await proxy(request('/apps', { 'accept-language': 'ja' }))
    expect(redirectPath(response)).toBe('/ja/apps')
  })

  it('serves lowercase prefixes from the canonical locale segment', async () => {
    const response = await proxy(request('/zh-hans/apps'))
    const rewrite = response.headers.get('x-middleware-rewrite')
    expect(rewrite && new URL(rewrite).pathname).toBe('/zh-Hans/apps')
  })
})

describe('admin language', () => {
  it('opens the back office in Chinese for an English browser that has not chosen', async () => {
    const response = await proxy(request('/admin/collections/apps', { 'accept-language': 'en-US,en;q=0.9' }))
    expect(response.headers.get('location')).toBeNull()
    expect(response.headers.get('x-middleware-request-cookie')).toContain('payload-lng=zh')
    expect(response.cookies.get('payload-lng')?.value).toBe('zh')
  })

  it('keeps the other cookies on the request', async () => {
    const response = await proxy(request('/admin', { cookie: 'payload-token=abc' }))
    const forwarded = response.headers.get('x-middleware-request-cookie') ?? ''
    expect(forwarded).toContain('payload-token=abc')
    expect(forwarded).toContain('payload-lng=zh')
  })

  it('leaves a language chosen in the back office alone', async () => {
    const response = await proxy(request('/admin', { 'accept-language': 'zh-CN', cookie: 'payload-lng=en' }))
    expect(response.headers.get('x-middleware-request-cookie')).toBeNull()
    expect(response.cookies.get('payload-lng')).toBeUndefined()
  })
})
