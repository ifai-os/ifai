import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { shareCard } from '@/lib/seo'
import { clip, serializeJsonLd } from '@/lib/structured-data'
import type { AppDetail } from '@/modules/apps/data'
import { appJsonLd } from '@/modules/apps/structured-data'
import type { StoryDetail } from '@/modules/daily/public/story-item'
import { storyJsonLd } from '@/modules/daily/public/structured-data'
import type { SkillDetail } from '@/modules/resources/public/data'
import { skillJsonLd } from '@/modules/resources/public/structured-data'

beforeEach(() => {
  vi.stubEnv('VERCEL_ENV', '')
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://ifai.io/')
})
afterEach(() => vi.unstubAllEnvs())

/** What the page would put in the script element, read back. */
const roundTrip = (data: Parameters<typeof serializeJsonLd>[0]) => JSON.parse(serializeJsonLd(data))

describe('serializeJsonLd', () => {
  it('cannot end the script element and leaves out empty fields', () => {
    const text = serializeJsonLd({ headline: 'A </script><script>alert(1)</script> & B', description: null, image: '', url: undefined })
    expect(text).not.toMatch(/[<>&]/)
    expect(JSON.parse(text)).toEqual({ headline: 'A </script><script>alert(1)</script> & B' })
  })

  it('clips by characters, not UTF-16 units', () => {
    expect(clip('一二三四五', 5)).toBe('一二三四五')
    expect(clip('一二三四五六', 5)).toBe('一二三四…')
    expect(clip('😀😀😀', 2)).toBe('😀…')
    expect(clip(' a \n b ', 10)).toBe('a b')
  })
})

describe('storyJsonLd', () => {
  const story = {
    id: 1,
    slug: 'openai-ships-a-thing',
    category: 'tools',
    publishedAt: '2026-10-22T08:00:00.000Z',
    correctedAt: null,
    title: { value: 'OpenAI 发布新模型', lang: 'zh-Hans' },
    summary: { value: '一句话摘要。', lang: 'zh-Hans' },
    tryIt: null,
    moreReports: 1,
    spread: 0,
    originalName: 'OpenAI',
    sources: [
      { name: 'The Verge', role: 'report', url: 'https://www.theverge.com/x', publishedAt: null },
      { name: 'OpenAI', role: 'original', url: 'https://openai.com/index/x', publishedAt: null },
    ],
    developments: [],
  } as unknown as StoryDetail
  const labels = { home: 'IFAI', daily: '日报', category: '产品动态' }

  it('is a NewsArticle with the dates and language the page shows', () => {
    const [article] = roundTrip(storyJsonLd(story, 'zh-Hans', labels))
    expect(article).toMatchObject({
      '@type': 'NewsArticle',
      headline: 'OpenAI 发布新模型',
      description: '一句话摘要。',
      inLanguage: 'zh-Hans',
      url: 'https://ifai.io/zh-hans/daily/openai-ships-a-thing',
      datePublished: '2026-10-22T08:00:00.000Z',
      dateModified: '2026-10-22T08:00:00.000Z',
      image: ['https://ifai.io/og-image-zh.png'],
      isBasedOn: 'https://openai.com/index/x',
      publisher: { '@type': 'Organization', name: 'IFAI', logo: 'https://ifai.io/icon-512.png' },
    })
  })

  it('takes the correction time as the modified date and marks an English fallback', () => {
    const corrected = { ...story, correctedAt: '2026-10-23T01:00:00.000Z', title: { value: 'OpenAI ships', lang: 'en' as const }, summary: null }
    const [article] = roundTrip(storyJsonLd(corrected, 'ja', labels))
    expect(article.dateModified).toBe('2026-10-23T01:00:00.000Z')
    expect(article.inLanguage).toBe('en')
    expect(article).not.toHaveProperty('description')
  })

  it('walks home › daily › category › story', () => {
    const [, trail] = roundTrip(storyJsonLd(story, 'en', labels))
    expect(trail['@type']).toBe('BreadcrumbList')
    expect(trail.itemListElement.map((item: { position: number; item: string }) => [item.position, item.item])).toEqual([
      [1, 'https://ifai.io/en'],
      [2, 'https://ifai.io/en/daily'],
      [3, 'https://ifai.io/en/daily/category/tools'],
      [4, 'https://ifai.io/en/daily/openai-ships-a-thing'],
    ])
  })
})

describe('appJsonLd', () => {
  const app = {
    id: 3,
    slug: 'notion',
    name: 'Notion',
    tagline: { value: 'Notes and docs', lang: 'en' },
    description: { value: 'A workspace for notes.', lang: 'en' },
    category: { id: 1, slug: 'productivity', name: 'Productivity' },
    pricing: 'freemium',
    logo: { url: '/api/media/file/notion-logo.png', width: 180, height: 180 },
    screenshot: { url: 'https://media.ifai.io/notion-og.png', width: 1200, height: 630 },
    website: 'https://www.notion.so',
    developer: 'Notion Labs',
    features: { value: [{ title: 'Docs' }, { title: 'Wikis', detail: 'Team pages' }], lang: 'en' },
  } as unknown as AppDetail

  it('is a SoftwareApplication with no rating and a price only when free', () => {
    const [software, trail] = roundTrip(appJsonLd(app, 'en', { home: 'IFAI', apps: 'Apps' }))
    expect(software).toMatchObject({
      '@type': 'SoftwareApplication',
      name: 'Notion',
      url: 'https://ifai.io/en/apps/notion',
      sameAs: 'https://www.notion.so',
      description: 'A workspace for notes.',
      applicationCategory: 'Productivity',
      image: 'https://ifai.io/api/media/file/notion-logo.png',
      screenshot: 'https://media.ifai.io/notion-og.png',
      featureList: ['Docs', 'Wikis'],
      author: { '@type': 'Organization', name: 'Notion Labs' },
    })
    expect(software).not.toHaveProperty('offers')
    expect(software).not.toHaveProperty('aggregateRating')
    expect(trail.itemListElement.map((item: { name: string }) => item.name)).toEqual(['IFAI', 'Apps', 'Productivity', 'Notion'])

    const [free] = roundTrip(appJsonLd({ ...app, pricing: 'open-source', category: null }, 'en', { home: 'IFAI', apps: 'Apps' }))
    expect(free.offers).toEqual({ '@type': 'Offer', price: '0', priceCurrency: 'USD' })
  })

  it('shares the website picture, or the site picture when there is none', () => {
    expect(shareCard('en', { image: { url: app.screenshot!.url } }).twitter).toMatchObject({ images: [app.screenshot!.url] })
    const card = shareCard('zh-Hant')
    expect(card.openGraph).toMatchObject({ type: 'website', siteName: 'IFAI', locale: 'zh_TW', images: [{ url: '/og-image-zh.png' }] })
  })
})

describe('skillJsonLd', () => {
  const skill = {
    slug: 'pdf-tools',
    name: { value: 'PDF tools', lang: 'en' },
    tagline: { value: 'Read and fill PDFs', lang: 'en' },
    category: 'productivity',
    author: { name: 'Jane', url: 'https://github.com/jane', official: false },
    repository: 'https://github.com/jane/pdf-tools',
    license: 'Apache-2.0',
    tags: [{ slug: 'pdf', name: { value: 'PDF', lang: 'en' } }, { slug: 'forms', name: { value: 'Forms', lang: 'en' } }],
    shown: { version: '1.2.0', publishedAt: '2026-10-20T00:00:00.000Z' },
  } as unknown as SkillDetail

  it('is SoftwareSourceCode for the shown version', () => {
    const [code, trail] = roundTrip(skillJsonLd(skill, 'ko', { home: 'IFAI', resources: '리소스', category: '생산성' }))
    expect(code).toMatchObject({
      '@type': 'SoftwareSourceCode',
      name: 'PDF tools',
      url: 'https://ifai.io/ko/resources/skills/pdf-tools',
      codeRepository: 'https://github.com/jane/pdf-tools',
      license: 'https://spdx.org/licenses/Apache-2.0.html',
      author: { '@type': 'Person', name: 'Jane', url: 'https://github.com/jane' },
      version: '1.2.0',
      dateModified: '2026-10-20T00:00:00.000Z',
      keywords: 'PDF, Forms',
    })
    expect(trail.itemListElement[2].item).toBe('https://ifai.io/ko/resources?category=productivity')

    const [own] = roundTrip(skillJsonLd({ ...skill, author: { ...skill.author, official: true }, license: null }, 'en', { home: 'IFAI', resources: 'Resources', category: 'Productivity' }))
    expect(own.author).toMatchObject({ '@type': 'Organization', name: 'IFAI' })
    expect(own).not.toHaveProperty('license')
  })
})
