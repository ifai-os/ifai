import { describe, expect, it } from 'vitest'

import type { AgentCaller } from '@/modules/agents/data'
import { bearerKey, settingsUrl, tooManyRequests, unauthorized } from '@/modules/agents/http'
import { hashKey, newKey } from '@/modules/agents/keys'
import { handleRest } from '@/modules/agents/rest'
import {
  adminFiltersFrom,
  agentRules,
  isExpired,
  isKey,
  keyHint,
  parseAgentInput,
  parseKeyInput,
  parseReason,
  sameName,
} from '@/modules/agents/rules'

const scout: AgentCaller = {
  keyId: 7,
  scope: 'write',
  expiresAt: '2027-01-31T00:00:00.000Z',
  agent: { id: 3, name: 'Scout', about: null },
  owner: { id: 'member-1', name: 'Mei' },
}

describe('agent keys', () => {
  it('are ifai_ and 43 letters and digits, different every time, kept only as a hash', () => {
    const keys = Array.from({ length: 200 }, newKey)
    for (const key of keys) expect(isKey(key), key).toBe(true)
    expect(new Set(keys).size).toBe(keys.length)
    expect(keys[0]).toHaveLength(48)
    expect(hashKey(keys[0])).toMatch(/^[0-9a-f]{64}$/)
    expect(hashKey(keys[0])).toBe(hashKey(keys[0]))
    expect(hashKey(keys[0])).not.toBe(hashKey(keys[1]))
    expect(keyHint('ifai_Ab12Cd34Ef')).toBe('ifai_Ab12Cd')
  })

  it('uses every letter and digit', () => {
    const seen = new Set(Array.from({ length: 100 }, newKey).flatMap((key) => [...key.slice(5)]))
    expect(seen.size).toBe(62)
  })

  it('tells a key from other strings', () => {
    expect(isKey(`ifai_${'a'.repeat(43)}`)).toBe(true)
    expect(isKey(`ifai_${'a'.repeat(42)}`)).toBe(false)
    expect(isKey(`ifai_${'a'.repeat(42)}-`)).toBe(false)
    expect(isKey(`IFAI_${'a'.repeat(43)}`)).toBe(false)
    expect(isKey('')).toBe(false)
  })

  it('reads the key from a Bearer header only', () => {
    const key = newKey()
    expect(bearerKey(`Bearer ${key}`)).toBe(key)
    expect(bearerKey(`bearer   ${key} `)).toBe(key)
    expect(bearerKey(key)).toBeNull()
    expect(bearerKey(`Basic ${key}`)).toBeNull()
    expect(bearerKey('Bearer ifai_short')).toBeNull()
    expect(bearerKey(`Bearer ${key} extra`)).toBeNull()
  })

  it('knows when a key has run out', () => {
    const now = new Date('2026-11-02T08:00:00Z')
    expect(isExpired({ expiresAt: '2026-11-02T08:00:00.000Z' }, now)).toBe(true)
    expect(isExpired({ expiresAt: '2026-11-02T08:00:01.000Z' }, now)).toBe(false)
  })
})

describe('agent settings input', () => {
  it('cleans names and introductions to one line and checks their length', () => {
    expect(parseAgentInput({ name: '  Scout​ ', about: ' Reads\nthe news ' })).toEqual({ ok: true, value: { name: 'Scout', about: 'Reads the news' } })
    expect(parseAgentInput({ name: 'Scout', about: '' })).toEqual({ ok: true, value: { name: 'Scout', about: null } })
    expect(parseAgentInput({ name: ' ' })).toEqual({ ok: false, error: 'empty-name' })
    expect(parseAgentInput({ name: 'x'.repeat(agentRules.maxName + 1) })).toEqual({ ok: false, error: 'name-too-long' })
    // Characters, not UTF-16 units: an emoji counts once.
    expect(parseAgentInput({ name: '🤖'.repeat(agentRules.maxName) })).toMatchObject({ ok: true })
    expect(parseAgentInput({ name: 'Scout', about: 'x'.repeat(agentRules.maxAbout + 1) })).toEqual({ ok: false, error: 'about-too-long' })
    expect(parseAgentInput(null)).toEqual({ ok: false, error: 'empty-name' })
  })

  it('sees the same name in another case or width', () => {
    expect(sameName('Scout', 'scout')).toBe(true)
    expect(sameName('ＳＣＯＵＴ', 'scout')).toBe(true)
    expect(sameName('Scout', 'Scout 2')).toBe(false)
  })

  it('takes a key’s note, permission and lifetime, and nothing else', () => {
    expect(parseKeyInput({ label: ' Laptop ', scope: 'read', days: 30 })).toEqual({ label: 'Laptop', scope: 'read', days: 30 })
    expect(parseKeyInput({ scope: 'write' })).toEqual({ label: null, scope: 'write', days: 90 })
    expect(parseKeyInput({ scope: 'admin' })).toBeNull()
    expect(parseKeyInput({ scope: 'read', days: 7 })).toBeNull()
    expect(parseKeyInput({ scope: 'read', days: '30' })).toBeNull()
    expect(parseKeyInput({ scope: 'read', label: 5 })).toBeNull()
    expect(parseKeyInput({ scope: 'read', label: 'x'.repeat(agentRules.maxLabel + 1) })).toBeNull()
  })
})

describe('agents in the back office', () => {
  it('takes a reason for turning an agent off, or none', () => {
    expect(parseReason({ reason: ' Posting ads\n' })).toBe('Posting ads')
    expect(parseReason({ reason: '' })).toBeNull()
    expect(parseReason({})).toBeNull()
    expect(parseReason(null)).toBeNull()
    expect(parseReason({ reason: 'x'.repeat(agentRules.maxReason + 1) })).toBeUndefined()
  })

  it('reads the page’s filters from its address', () => {
    expect(adminFiltersFrom({ agent: '12', disabled: '1', page: '3' })).toEqual({ agent: 12, disabled: true, page: 3 })
    expect(adminFiltersFrom({ agent: 'x', disabled: 'yes', page: '-1' })).toEqual({ agent: null, disabled: false, page: 1 })
    expect(adminFiltersFrom(undefined)).toEqual({ agent: null, disabled: false, page: 1 })
  })
})

describe('answers to keys that do not work', () => {
  const origin = 'https://ifai.io'

  it('says why in the body and in WWW-Authenticate, and where to get a new key', async () => {
    const expired = unauthorized('expired', origin)
    expect(expired.status).toBe(401)
    expect(expired.headers.get('cache-control')).toBe('private, no-store')
    expect(expired.headers.get('www-authenticate')).toMatch(/^Bearer realm="IFAI", error="invalid_token", error_description="This IFAI key has expired/)
    const body = (await expired.json()) as { error: { code: string; message: string } }
    expect(body.error.code).toBe('unauthorized')
    expect(body.error.message).toContain(settingsUrl(origin))
    expect(settingsUrl(origin)).toBe('https://ifai.io/en/me/account?section=agents')

    // Header-safe: the body's "ifai_…" is "ifai_..." there.
    const malformed = unauthorized('malformed', origin).headers.get('www-authenticate')
    expect(malformed).toContain('error="invalid_request"')
    expect(malformed).toContain('Bearer ifai_...')
    expect(malformed).toMatch(/^[\x20-\x7e]+$/)
    expect(unauthorized('missing', origin).headers.get('www-authenticate')).toBe('Bearer realm="IFAI"')
    expect(((await unauthorized('disabled', origin).json()) as { error: { message: string } }).error.message).toContain('turned this agent off')
  })

  it('tells a caller over the limit when to try again', async () => {
    const response = tooManyRequests(12)
    expect(response.status).toBe(429)
    expect(response.headers.get('retry-after')).toBe('12')
    expect(response.headers.get('access-control-expose-headers')).toContain('Retry-After')
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe('rate_limited')
  })
})

describe('GET /api/v1/me', () => {
  const get = (caller: AgentCaller | null, query = '') => handleRest(new Request(`http://localhost:3000/api/v1/me${query}`), caller)

  it('needs a key', async () => {
    const response = await get(null)
    expect(response.status).toBe(401)
    expect(response.headers.get('www-authenticate')).toBe('Bearer realm="IFAI"')
  })

  it('tells the agent who it is and who answers for it, never to a shared cache', async () => {
    const response = await get(scout, '?lang=ko')
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(await response.json()).toMatchObject({
      agent: { id: 3, name: 'Scout' },
      owner: { name: 'Mei' },
      key: { scope: 'write', expiresAt: '2027-01-31T00:00:00.000Z' },
      limits: { requestsPerMinute: agentRules.perMinute },
      settings: 'http://localhost:3000/ko/me/account?section=agents',
    })
    const markdown = await (await get(scout, '?format=md')).text()
    expect(markdown).toContain('You are **Scout**')
    expect(markdown).toContain('read and write')
  })

  it('is in the index and the OpenAPI document as needing a key', async () => {
    const index = (await (await handleRest(new Request('http://localhost:3000/api/v1'))).json()) as { endpoints: { path: string; needsKey?: boolean }[] }
    expect(index.endpoints).toContainEqual(expect.objectContaining({ path: '/api/v1/me', needsKey: true }))
    const openapi = (await (await handleRest(new Request('http://localhost:3000/api/v1/openapi.json'))).json()) as {
      paths: Record<string, { get: { security: unknown[] } }>
      components: { securitySchemes: Record<string, unknown> }
    }
    expect(openapi.paths['/me'].get.security).toEqual([{ ifaiKey: [] }])
    expect(openapi.paths['/news'].get.security).toEqual([{}, { ifaiKey: [] }])
    expect(openapi.components.securitySchemes.ifaiKey).toMatchObject({ type: 'http', scheme: 'bearer' })
  })
})
