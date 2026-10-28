import { describe, expect, it } from 'vitest'

import { importAllowed } from '@/modules/daily/import/endpoint'
import { importApprovedAt, importSources, importTags, parseImport, parseImportStory, slugCandidates } from '@/modules/daily/import/rules'

/** A line as `newscrawler export-stories` writes it (trimmed). */
const exported = {
  slug: 'anthropic-launches-claude-duet-agent',
  category: 'tools',
  tags: ['agents', 'assistants'],
  publishedAt: '2026-10-21T07:00:00Z',
  locales: {
    'zh-Hans': { title: 'Anthropic 推出主动智能体 Claude Duet', summary: '10 月 21 日，Anthropic 开启 Claude Duet 候补测试。', tryIt: '申请加入 waitlist。', body: '第一段。\r\n\r\n## 小标题\n\n第二段。' },
    en: { title: "Anthropic's new proactive agent works while you sleep", summary: 'Claude Duet opens a waitlist.', tryIt: null, body: null },
    ja: { title: 'Claude Duet', summary: '' },
  },
  sources: [
    { url: 'https://claude.com/resources/articles/claude-duet?utm_source=x', publisher: 'claude.com', title: 'Introducing Claude Duet', publishedAt: '2026-10-21T00:00:00Z' },
    { url: 'https://www.theverge.com/ai/1015843/claude-duet', publisher: 'theverge.com', title: 'Anthropic takes on Muse', publishedAt: '2026-10-21T19:53:20Z' },
  ],
  score: 94.5,
  feishu: { month: '2026-10', record_id: 'reczz28RGOG7WWeG' },
}

describe('stories imported from the pipeline', () => {
  it('reads an exported line', () => {
    const parsed = parseImportStory(exported)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    const { story } = parsed
    expect(story).toMatchObject({
      recordId: 'reczz28RGOG7WWeG',
      month: '2026-10',
      slug: 'anthropic-launches-claude-duet-agent',
      category: 'tools',
      tags: ['agents', 'assistants'],
      publishedAt: '2026-10-21T07:00:00.000Z',
      score: 94.5,
    })
    expect(story.sources).toEqual([
      { name: 'claude.com', role: 'original', url: 'https://claude.com/resources/articles/claude-duet', publishedAt: '2026-10-21T00:00:00.000Z' },
      { name: 'theverge.com', role: 'report', url: 'https://www.theverge.com/ai/1015843/claude-duet', publishedAt: '2026-10-21T19:53:20.000Z' },
    ])
    expect(story.text['zh-Hans']?.body).toBe('第一段。\n\n## 小标题\n\n第二段。')
    expect(story.text.en).toEqual({ title: "Anthropic's new proactive agent works while you sleep", summary: 'Claude Duet opens a waitlist.', tryIt: null, body: null })
    // Japanese without a summary is left out: the page falls back to English.
    expect(story.text.ja).toBeUndefined()
    expect('zh-Hant' in story.text).toBe(false)
  })

  it('says what is wrong with a line it cannot take', () => {
    const without = (key: string, value: unknown = undefined) => parseImportStory({ ...exported, [key]: value })
    expect(without('feishu')).toEqual({ ok: false, error: 'feishu.record_id is missing' })
    expect(without('category', 'product')).toMatchObject({ ok: false, error: expect.stringContaining('category "product"') })
    expect(without('publishedAt', 'soon')).toMatchObject({ ok: false, error: expect.stringContaining('publishedAt') })
    expect(without('locales', { 'zh-Hans': exported.locales['zh-Hans'] })).toMatchObject({ ok: false, error: expect.stringContaining('locales.en') })
    expect(without('sources', ['not a url'])).toMatchObject({ ok: false, error: expect.stringContaining('sources') })
    expect(parseImportStory('text')).toEqual({ ok: false, error: 'not a JSON object' })
  })

  it('makes a slug from the English title when the line has none', () => {
    const parsed = parseImportStory({ ...exported, slug: '' })
    expect(parsed.ok && parsed.story.slug).toBe('anthropic-s-new-proactive-agent-works-while-you-sleep')
  })

  it('keeps known tags only, at most three', () => {
    expect(importTags(['agents', 'agents', 'robots', 'voice', 'chips', 'deals'])).toEqual(['agents', 'voice', 'chips'])
    expect(importTags('agents')).toEqual([])
  })

  it('lists the original first, marks discussion threads and drops repeated addresses', () => {
    expect(
      importSources([
        'https://example.com/post',
        { url: 'https://example.com/post/' },
        { url: 'https://news.ycombinator.com/item?id=1' },
        { url: 'https://x.com/someone/status/1', publisher: 'X' },
        { url: 'ftp://example.com/file' },
      ]),
    ).toEqual([
      { name: 'example.com', role: 'original', url: 'https://example.com/post', publishedAt: null },
      { name: 'news.ycombinator.com', role: 'discussion', url: 'https://news.ycombinator.com/item?id=1', publishedAt: null },
      { name: 'X', role: 'discussion', url: 'https://x.com/someone/status/1', publishedAt: null },
    ])
  })

  it('reads JSON Lines or a JSON array, numbering the lines', () => {
    const lines = parseImport(`${JSON.stringify(exported)}\n\n{oops\n`)
    expect(lines.map(({ line, parsed }) => [line, parsed.ok])).toEqual([
      [1, true],
      [3, false],
    ])
    expect(parseImport(JSON.stringify([exported, exported])).length).toBe(2)
    expect(parseImport('   ')).toEqual([])
  })

  it('appends the date when the slug is taken', () => {
    expect(slugCandidates('claude-duet', '2026-10-21T07:00:00.000Z').slice(0, 3)).toEqual(['claude-duet', 'claude-duet-2026-10-21', 'claude-duet-2026-10-21-2'])
  })

  it('approves a new story at its publish time, never later than now', () => {
    const now = new Date('2026-10-28T08:00:00Z')
    expect(importApprovedAt('2026-10-21T07:00:00.000Z', now)).toBe('2026-10-21T07:00:00.000Z')
    expect(importApprovedAt('2026-10-29T07:00:00.000Z', now)).toBe('2026-10-28T08:00:00.000Z')
  })

  it('lets in a signed-in admin or the pipeline with its token', () => {
    const request = (authorization?: string, user: unknown = null) =>
      ({ user, headers: new Headers(authorization ? { authorization } : {}) }) as Parameters<typeof importAllowed>[0]
    const env = { STORY_IMPORT_TOKEN: 'secret-token' }
    expect(importAllowed(request('Bearer secret-token'), env)).toBe(true)
    expect(importAllowed(request('Bearer wrong'), env)).toBe(false)
    expect(importAllowed(request(), env)).toBe(false)
    expect(importAllowed(request('Bearer secret-token'), {})).toBe(false)
    expect(importAllowed(request(undefined, { id: 1 }), {})).toBe(true)
  })
})
