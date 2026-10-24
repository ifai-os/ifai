import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { siteUrl } from '@/lib/site-url'

beforeEach(() => {
  vi.stubEnv('VERCEL_ENV', '')
  vi.stubEnv('VERCEL_URL', '')
  vi.stubEnv('PREVIEW_SITE_URL', '')
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', '')
  vi.stubEnv('VERCEL_PROJECT_PRODUCTION_URL', '')
})
afterEach(() => vi.unstubAllEnvs())

describe('siteUrl', () => {
  it('uses the site address in production', () => {
    vi.stubEnv('VERCEL_ENV', 'production')
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://ifai.io/')
    vi.stubEnv('PREVIEW_SITE_URL', 'https://ifai-preview-ifai1.vercel.app')
    expect(siteUrl()).toBe('https://ifai.io')
  })

  it('never points a preview at production', () => {
    vi.stubEnv('VERCEL_ENV', 'preview')
    vi.stubEnv('VERCEL_URL', 'ifai-abc123-ifai1.vercel.app')
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://ifai.io')
    expect(siteUrl()).toBe('https://ifai-abc123-ifai1.vercel.app')
  })

  it("uses the fixed address on main's preview", () => {
    vi.stubEnv('VERCEL_ENV', 'preview')
    vi.stubEnv('VERCEL_URL', 'ifai-abc123-ifai1.vercel.app')
    vi.stubEnv('PREVIEW_SITE_URL', 'https://ifai-preview-ifai1.vercel.app/')
    expect(siteUrl()).toBe('https://ifai-preview-ifai1.vercel.app')
  })

  it('falls back to localhost', () => {
    expect(siteUrl()).toBe('http://localhost:3000')
  })
})
