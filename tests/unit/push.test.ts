import { describe, expect, it } from 'vitest'

import { appNameFromTitle, parsePush, pushedStatus, sourceOnSite, tokenMatches } from '@/modules/push/rules'

import { bodyFor, describe as describeResult, failureMessage, guessKind, requestHeaders } from '../../extension/push.js'

const page = (over: Record<string, unknown> = {}) => ({
  url: 'https://www.theverge.com/ai/1015843/claude-duet',
  canonical: null,
  title: 'Anthropic takes on Muse',
  summary: 'A proactive agent.',
  siteName: 'The Verge',
  appName: null,
  ogType: null,
  publishedAt: null,
  types: [] as string[],
  ...over,
})

describe('browser push: the request', () => {
  it('normalizes a news address the way collected links are', () => {
    const parsed = parsePush({ kind: 'news', url: 'https://WWW.TheVerge.com/ai/1015843/claude-duet/?utm_source=x#top', title: '  Anthropic   takes on Muse ', publishedAt: '2026-10-21T19:53:20Z', siteName: 'The Verge' })
    expect(parsed).toEqual({
      ok: true,
      push: {
        kind: 'news',
        url: 'https://www.theverge.com/ai/1015843/claude-duet',
        site: 'theverge.com',
        title: 'Anthropic takes on Muse',
        summary: null,
        publishedAt: new Date('2026-10-21T19:53:20Z'),
        siteName: 'The Verge',
      },
    })
  })

  it('refuses a home page as news, and anything that is not a web address', () => {
    expect(parsePush({ kind: 'news', url: 'https://cursor.com/' })).toMatchObject({ ok: false })
    expect(parsePush({ kind: 'news', url: 'chrome://extensions' })).toMatchObject({ ok: false })
    expect(parsePush({ kind: 'video', url: 'https://example.com/a' })).toMatchObject({ ok: false })
    expect(parsePush(null)).toMatchObject({ ok: false })
  })

  it('takes a tool by its site, matched by domain like the batch import', () => {
    expect(parsePush({ kind: 'app', url: 'https://www.cursor.com/pricing?ref=producthunt', title: 'Cursor - The AI Code Editor' })).toEqual({
      ok: true,
      push: { kind: 'app', website: 'https://www.cursor.com', domain: 'cursor.com', name: 'Cursor' },
    })
    expect(parsePush({ kind: 'app', url: 'https://claude.ai/new', name: 'Claude' })).toMatchObject({ push: { name: 'Claude', domain: 'claude.ai' } })
  })

  it('names an app from the first part of its page title only when it is short', () => {
    expect(appNameFromTitle('Claude | Anthropic')).toBe('Claude')
    expect(appNameFromTitle('Perplexity: Where knowledge begins')).toBe('Perplexity')
    expect(appNameFromTitle('The fastest way to build apps with AI, from idea to production in minutes')).toBe('')
    expect(appNameFromTitle(null)).toBe('')
  })

  it('archives a report published over 48 hours ago, as collection does', () => {
    const now = new Date('2026-11-02T08:00:00Z')
    expect(pushedStatus(new Date('2026-11-01T08:00:00Z'), now)).toBe('fresh')
    expect(pushedStatus(new Date('2026-10-30T07:00:00Z'), now)).toBe('archived')
    expect(pushedStatus(null, now)).toBe('fresh')
  })

  it('accepts only the configured token', () => {
    const env = { PUSH_TOKEN: 'secret-123' }
    expect(tokenMatches('Bearer secret-123', env)).toBe(true)
    expect(tokenMatches('bearer  secret-123 ', env)).toBe(true)
    expect(tokenMatches('Bearer secret-124', env)).toBe(false)
    expect(tokenMatches(null, env)).toBe(false)
    expect(tokenMatches('Bearer ', { PUSH_TOKEN: '' })).toBe(false)
    expect(tokenMatches('Bearer anything', {})).toBe(false)
  })

  it('puts a report under a source on the same site', () => {
    expect(sourceOnSite({ url: 'https://www.theverge.com/rss/ai/index.xml' }, 'theverge.com')).toBe(true)
    expect(sourceOnSite({ url: 'https://rsshub.app/anthropic/news', homepage: 'https://www.anthropic.com/news' }, 'anthropic.com')).toBe(true)
    expect(sourceOnSite({ url: 'https://rsshub.app/anthropic/news', homepage: null }, 'anthropic.com')).toBe(false)
  })
})

describe('browser push: the extension', () => {
  it('guesses news from what an article page says about itself', () => {
    expect(guessKind(page({ ogType: 'article' }))).toBe('news')
    expect(guessKind(page({ url: 'https://openai.com/index/introducing-x', publishedAt: '2026-10-30' }))).toBe('news')
    expect(guessKind(page({ url: 'https://example.com/blog/post', types: ['NewsArticle'] }))).toBe('news')
  })

  it('guesses a tool from a front page or an application schema', () => {
    expect(guessKind(page({ url: 'https://cursor.com/' }))).toBe('app')
    expect(guessKind(page({ url: 'https://www.perplexity.ai/hub/getting-started', types: ['WebApplication'] }))).toBe('app')
    expect(guessKind(page({ url: 'https://lovable.dev/pricing' }))).toBe('app')
  })

  it('sends the canonical address only when it is on the same site', () => {
    expect(bodyFor('news', page({ canonical: 'https://www.theverge.com/2026/10/21/claude-duet' })).url).toBe('https://www.theverge.com/2026/10/21/claude-duet')
    expect(bodyFor('news', page({ canonical: 'https://syndicated.example/x' })).url).toBe('https://www.theverge.com/ai/1015843/claude-duet')
    expect(bodyFor('app', page({ url: 'https://cursor.com/', siteName: 'Cursor' }))).toEqual({ kind: 'app', url: 'https://cursor.com/', title: 'Anthropic takes on Muse', name: 'Cursor' })
  })

  it('says what happened to a push', () => {
    const server = 'https://ifai.example'
    expect(describeResult({ kind: 'app', action: 'known', id: 7, name: 'Cursor', website: 'https://cursor.com' }, server)).toMatchObject({
      title: '已有这个应用：Cursor',
      link: 'https://ifai.example/admin/collections/apps/7',
    })
    expect(
      describeResult({ kind: 'news', action: 'known', itemId: 3, status: 'fresh', source: { name: 'The Verge' }, story: { id: 12, slug: 'claude-duet', status: 'published' } }, server),
    ).toMatchObject({ title: '已经有了（The Verge）', link: 'https://ifai.example/admin/collections/stories/12' })
    const created = describeResult({ kind: 'news', action: 'created', itemId: 4, status: 'fresh', source: { name: 'theverge.com', created: true }, collectEnabled: false, modelCallsEnabled: true }, server)
    expect(created.title).toBe('已推进采集流程')
    expect(created.warning).toContain('COLLECT_ENABLED')
  })

  it('sends Vercel\'s bypass header only when one is set', () => {
    expect(requestHeaders({ token: 't', bypass: '' }, false)).toEqual({ Authorization: 'Bearer t' })
    expect(requestHeaders({ token: 't', bypass: 'b' }, true)).toEqual({
      Authorization: 'Bearer t',
      'x-vercel-protection-bypass': 'b',
      'Content-Type': 'application/json',
    })
  })

  it('tells a wrong token apart from Vercel\'s access protection', () => {
    expect(failureMessage(401, { error: 'unauthorized' }, { bypass: '' })).toContain('令牌不对')
    // Vercel answers a protected preview with its own page, not our JSON.
    expect(failureMessage(401, null, { bypass: '' })).toContain('填上保护绕过密钥')
    expect(failureMessage(401, null, { bypass: 'wrong' })).toContain('保护绕过密钥不对')
    expect(failureMessage(404, null, { bypass: '' })).toContain('没有推送接口')
    expect(failureMessage(400, { error: 'invalid', message: 'This is a home page, not an article.' }, { bypass: '' })).toBe('This is a home page, not an article.')
    expect(failureMessage(502, null, { bypass: '' })).toBe('网站返回 502')
  })
})
