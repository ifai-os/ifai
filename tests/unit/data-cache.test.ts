import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { unstableCache } = vi.hoisted(() => ({ unstableCache: vi.fn((fn: unknown) => fn) }))
vi.mock('next/cache', () => ({ unstable_cache: unstableCache }))

async function load(uri: string) {
  vi.resetModules()
  vi.stubEnv('DATABASE_URI', uri)
  return import('@/lib/data-cache')
}

describe('data cache scope', () => {
  beforeEach(() => unstableCache.mockClear())
  afterEach(() => vi.unstubAllEnvs())

  it('gives each database its own keys and tags', async () => {
    const main = await load('postgres://main')
    const mainScope = main.dataCacheScope()
    const mainTag = main.dataTag('apps')
    const branch = await load('postgres://pr-61')
    expect(mainScope).toMatch(/^[0-9a-f]{12}$/)
    expect(branch.dataCacheScope()).not.toBe(mainScope)
    expect(branch.dataTag('apps')).not.toBe(mainTag)
  })

  it('shares them between deployments on the same database', async () => {
    const first = (await load('postgres://main')).dataTag('daily')
    const second = (await load('postgres://main')).dataTag('daily')
    expect(second).toBe(first)
  })

  it('scopes the key parts and tags it hands to unstable_cache', async () => {
    const { cached, dataCacheScope, dataTag } = await load('postgres://main')
    const fn = async () => 1
    cached(fn, ['apps-list'], { tags: ['apps', 'daily'], revalidate: 3600 })
    expect(unstableCache).toHaveBeenCalledWith(fn, [dataCacheScope(), 'apps-list'], {
      tags: [dataTag('apps'), dataTag('daily')],
      revalidate: 3600,
    })
  })
})
