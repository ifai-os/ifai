import { describe, expect, it } from 'vitest'

import { tagAndTopicPages } from '@/modules/daily/public/sitemap-pages'

describe('tag and topic pages in the sitemap', () => {
  const stories = [
    { upAt: '2026-11-01T08:00:00.000Z', tags: ['agents', 'deals'], entities: [{ key: 'openai' }, { key: 'gpt5' }] },
    { upAt: '2026-11-03T08:00:00.000Z', tags: ['agents'], entities: [{ key: 'openai' }, { key: 'openai' }] },
    { upAt: '2026-11-02T08:00:00.000Z', tags: ['not-a-tag'], entities: [{ key: 'kimi' }, { key: null }, { key: 'Not A Key' }] },
    { upAt: '2026-11-02T09:00:00.000Z', tags: null, entities: [{ key: 'kimi' }, { key: 'gpt5' }] },
    { upAt: null, tags: [], entities: [{ key: 'kimi' }] },
  ]

  it('lists the tags that have stories, dated by the newest', () => {
    expect(tagAndTopicPages(stories).tags).toEqual([
      { path: '/news/tag/agents', lastModified: '2026-11-03T08:00:00.000Z' },
      { path: '/news/tag/deals', lastModified: '2026-11-01T08:00:00.000Z' },
    ])
  })

  it('lists topics of two stories or more, busiest first, counting a story once', () => {
    expect(tagAndTopicPages(stories).topics).toEqual([
      { path: '/news/topic/kimi', lastModified: '2026-11-02T09:00:00.000Z' },
      { path: '/news/topic/gpt5', lastModified: '2026-11-02T09:00:00.000Z' },
      { path: '/news/topic/openai', lastModified: '2026-11-03T08:00:00.000Z' },
    ])
  })

  it('is empty without stories', () => {
    expect(tagAndTopicPages([])).toEqual({ tags: [], topics: [] })
  })
})
