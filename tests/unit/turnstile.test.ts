import { describe, expect, it, vi } from 'vitest'

import { turnstileSecret, verifyTurnstile } from '@/lib/turnstile'

function answer(body: object, ok = true) {
  return vi.fn(async () => ({ ok, json: async () => body }) as Response)
}

describe('turnstileSecret', () => {
  it('is on only with both keys', () => {
    expect(turnstileSecret({ TURNSTILE_SECRET_KEY: 's', NEXT_PUBLIC_TURNSTILE_SITE_KEY: 'k' })).toBe('s')
    expect(turnstileSecret({ TURNSTILE_SECRET_KEY: 's' })).toBeNull()
    expect(turnstileSecret({ NEXT_PUBLIC_TURNSTILE_SITE_KEY: 'k' })).toBeNull()
    expect(turnstileSecret({ TURNSTILE_SECRET_KEY: ' ', NEXT_PUBLIC_TURNSTILE_SITE_KEY: 'k' })).toBeNull()
  })
})

describe('verifyTurnstile', () => {
  const base = { secret: 's', token: 't', action: 'subscribe' as const }

  it('passes a fresh token for the same action', async () => {
    const fetcher = answer({ success: true, action: 'subscribe' })
    expect(await verifyTurnstile({ ...base, ip: '1.2.3.4', fetcher })).toBe(true)
    const [, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit]
    expect(JSON.parse(init.body as string)).toEqual({ secret: 's', response: 't', remoteip: '1.2.3.4' })
  })

  it('turns away a token made for another form', async () => {
    expect(await verifyTurnstile({ ...base, fetcher: answer({ success: true, action: 'sign-in' }) })).toBe(false)
  })

  it('turns away a refused or missing token without asking twice', async () => {
    expect(await verifyTurnstile({ ...base, fetcher: answer({ success: false, 'error-codes': ['timeout-or-duplicate'] }) })).toBe(false)
    const fetcher = answer({ success: true, action: 'subscribe' })
    expect(await verifyTurnstile({ ...base, token: null, fetcher })).toBe(false)
    expect(await verifyTurnstile({ ...base, token: '  ', fetcher })).toBe(false)
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('fails closed when Cloudflare does not answer', async () => {
    const down = vi.fn(async () => {
      throw new Error('network')
    })
    expect(await verifyTurnstile({ ...base, fetcher: down })).toBe(false)
    expect(await verifyTurnstile({ ...base, fetcher: answer({}, false) })).toBe(false)
  })
})
