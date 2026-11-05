import type { PayloadRequest } from 'payload'
import { describe, expect, it } from 'vitest'

import { isPublicEndpoint, readerAccess } from '@/lib/reader-access'

const published = { status: { equals: 'published' } }

function check(req: Partial<PayloadRequest>) {
  return readerAccess(published)({ req: req as PayloadRequest })
}

describe('readerAccess', () => {
  it('lets signed-in admins read everything, through any API', () => {
    expect(check({ user: { id: 1 } as PayloadRequest['user'], payloadAPI: 'REST' })).toBe(true)
    expect(check({ user: { id: 1 } as PayloadRequest['user'], payloadAPI: 'local' })).toBe(true)
  })

  it('gives the site pages (Local API) only what visitors may see', () => {
    expect(check({ user: null, payloadAPI: 'local' })).toEqual(published)
  })

  it("shuts Payload's public REST and GraphQL to visitors", () => {
    expect(check({ user: null, payloadAPI: 'REST' })).toBe(false)
    expect(check({ user: null, payloadAPI: 'GraphQL' })).toBe(false)
  })

  it('tells the endpoints apart', () => {
    expect(isPublicEndpoint({ payloadAPI: 'REST' })).toBe(true)
    expect(isPublicEndpoint({ payloadAPI: 'local' })).toBe(false)
  })
})
