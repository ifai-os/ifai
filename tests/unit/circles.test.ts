import { describe, expect, it } from 'vitest'

import {
  circleRules,
  commentRules,
  excerpt,
  hotCircleIds,
  hotScore,
  linkify,
  mediaRules,
  parseCommentInput,
  parseMembershipInput,
  parsePostInput,
  parseReactionInput,
  parseReportInput,
  parseTab,
  postLocale,
  postPath,
  postTitleValues,
  shownTab,
  siteLinks,
  sortReactions,
  toggleReaction,
  type ReactionView,
} from '@/modules/circles/rules'

describe('circles: post input', () => {
  it('keeps line breaks, drops invisible characters and trims', () => {
    expect(parsePostInput({ circle: 3, body: '  First line\r\n\n\n\nsecond​  ', locale: 'zh-Hans' })).toEqual({
      ok: true,
      value: { circle: 3, body: 'First line\n\nsecond', locale: 'zh-Hans', images: [], video: null },
    })
    expect(parsePostInput({ circle: '3', body: 'id as text', locale: 'en' })).toMatchObject({ ok: true, value: { circle: 3 } })
  })

  it('counts characters the way readers do, emoji and CJK as one each', () => {
    expect(parsePostInput({ circle: 1, body: '画'.repeat(circleRules.maxBody), locale: 'ja' }).ok).toBe(true)
    expect(parsePostInput({ circle: 1, body: '🎨'.repeat(circleRules.maxBody), locale: 'ja' }).ok).toBe(true)
    expect(parsePostInput({ circle: 1, body: 'a'.repeat(circleRules.maxBody + 1), locale: 'ja' })).toEqual({ ok: false, error: 'body-too-long' })
  })

  it('says what is wrong', () => {
    expect(parsePostInput({ circle: 0, body: 'x', locale: 'en' })).toEqual({ ok: false, error: 'invalid-circle' })
    expect(parsePostInput({ circle: 1.5, body: 'x', locale: 'en' })).toEqual({ ok: false, error: 'invalid-circle' })
    expect(parsePostInput({ circle: 1, body: ' \n​ ', locale: 'en' })).toEqual({ ok: false, error: 'empty-body' })
    expect(parsePostInput({ circle: 1, body: 42, locale: 'en' })).toEqual({ ok: false, error: 'empty-body' })
    expect(parsePostInput({ circle: 1, body: 'x', locale: 'fr' })).toEqual({ ok: false, error: 'invalid-locale' })
    expect(parsePostInput(null)).toEqual({ ok: false, error: 'invalid-circle' })
  })

  it('takes pictures and a video, and then the text can be left out', () => {
    expect(parsePostInput({ circle: 1, body: '', locale: 'en', images: [4, '7', 2] })).toEqual({
      ok: true,
      value: { circle: 1, body: '', locale: 'en', images: [4, 7, 2], video: null },
    })
    expect(parsePostInput({ circle: 1, body: ' ', locale: 'en', video: 9 })).toMatchObject({ ok: true, value: { body: '', images: [], video: 9 } })
    expect(parsePostInput({ circle: 1, body: '', locale: 'en', images: [] })).toEqual({ ok: false, error: 'empty-body' })
    expect(parsePostInput({ circle: 1, body: 'x', locale: 'en', images: Array.from({ length: mediaRules.maxImages }, (_, i) => i + 1) }).ok).toBe(true)
    expect(parsePostInput({ circle: 1, body: 'x', locale: 'en', images: Array.from({ length: mediaRules.maxImages + 1 }, (_, i) => i + 1) })).toEqual({
      ok: false,
      error: 'too-many-images',
    })
    expect(parsePostInput({ circle: 1, body: 'x', locale: 'en', images: [3, 3] })).toEqual({ ok: false, error: 'invalid-images' })
    expect(parsePostInput({ circle: 1, body: 'x', locale: 'en', images: [0] })).toEqual({ ok: false, error: 'invalid-images' })
    expect(parsePostInput({ circle: 1, body: 'x', locale: 'en', images: '3' })).toEqual({ ok: false, error: 'invalid-images' })
    expect(parsePostInput({ circle: 1, body: 'x', locale: 'en', video: 'abc' })).toEqual({ ok: false, error: 'invalid-video' })
    expect(parsePostInput({ circle: 1, body: 'x', locale: 'en', video: null })).toMatchObject({ ok: true, value: { video: null } })
  })

  it('reads joins, reactions and reports, and nothing else', () => {
    expect(parseMembershipInput({ circle: 2, joined: false })).toEqual({ circle: 2, joined: false })
    expect(parseMembershipInput({ circle: 2, joined: 'yes' })).toBeNull()
    expect(parseReactionInput({ post: 9, reaction: 'rocket', on: true })).toEqual({ post: 9, reaction: 'rocket', on: true })
    expect(parseReactionInput({ post: 9, reaction: 'thumbs', on: true })).toBeNull()
    expect(parseReactionInput({ post: 9, reaction: 'like' })).toBeNull()
    expect(parseReportInput({ post: 9, reason: 'offTopic' })).toEqual({ target: { kind: 'post', id: 9 }, reason: 'offTopic' })
    expect(parseReportInput({ comment: 31, reason: 'spam' })).toEqual({ target: { kind: 'comment', id: 31 }, reason: 'spam' })
    expect(parseReportInput({ post: 9, reason: 'boring' })).toBeNull()
    expect(parseReportInput({ post: 9, comment: 31, reason: 'spam' })).toBeNull()
    expect(parseReportInput({ reason: 'spam' })).toBeNull()
  })

  it('reads the tab from the address: 推荐 when there is none', () => {
    expect(parseTab(null)).toBe('hot')
    expect(parseTab('')).toBe('hot')
    expect(parseTab('latest')).toBe('latest')
    expect(parseTab('mine')).toBe('mine')
    expect(parseTab('following')).toBe('following')
    expect(parseTab('friends')).toBeNull()
  })

  it('shows 推荐 inside a circle for the tabs that span every circle', () => {
    expect(shownTab('following', true)).toBe('hot')
    expect(shownTab('mine', true)).toBe('hot')
    expect(shownTab('latest', true)).toBe('latest')
    expect(shownTab('following', false)).toBe('following')
  })
})

describe('circles: 推荐 and 热议', () => {
  it('ranks by the people who reacted, fading with age', () => {
    const fresh = hotScore({ people: 0, hours: 0 })
    expect(hotScore({ people: 3, hours: 0 })).toBeGreaterThan(fresh)
    expect(hotScore({ people: 3, hours: 30 })).toBeLessThan(hotScore({ people: 3, hours: 1 }))
    // A day-old post needs many more people than a new one.
    expect(hotScore({ people: 10, hours: 24 })).toBeLessThan(hotScore({ people: 1, hours: 1 }))
    expect(hotScore({ people: 0, commenters: 1, hours: 2 })).toBe(hotScore({ people: 2, hours: 2 }))
    expect(hotScore({ people: 0, hours: -1 })).toBe(fresh)
  })

  it('badges the two busiest circles today with five posts or more', () => {
    const today = [
      { id: 1, today: 4 },
      { id: 2, today: 9 },
      { id: 3, today: 5 },
      { id: 4, today: 9 },
    ]
    expect(hotCircleIds(today)).toEqual([2, 4])
    expect(hotCircleIds([{ id: 1, today: 4 }])).toEqual([])
    expect(hotCircleIds([{ id: 3, today: 5 }])).toEqual([3])
  })
})

describe('circles: reactions', () => {
  const list: ReactionView[] = [
    { reaction: 'like', count: 3, mine: false, names: ['Lin', 'Kai'] },
    { reaction: 'rocket', count: 3, mine: true, names: ['Ana'] },
    { reaction: 'eyes', count: 1, mine: false, names: ['Kai'] },
  ]

  it('puts the most people first, the picker’s order breaking ties, and drops empty ones', () => {
    const shuffled = [list[2], list[1], list[0], { reaction: 'love' as const, count: 0, mine: false, names: [] }]
    expect(sortReactions(shuffled).map((item) => item.reaction)).toEqual(['like', 'rocket', 'eyes'])
  })

  it('turns the reader’s reaction on and off before the server answers', () => {
    expect(toggleReaction(list, 'eyes', true)).toEqual([
      { reaction: 'like', count: 3, mine: false, names: ['Lin', 'Kai'] },
      { reaction: 'rocket', count: 3, mine: true, names: ['Ana'] },
      { reaction: 'eyes', count: 2, mine: true, names: ['Kai'] },
    ])
    expect(toggleReaction(list, 'rocket', false).map((item) => [item.reaction, item.count, item.mine])).toEqual([
      ['like', 3, false],
      ['rocket', 2, false],
      ['eyes', 1, false],
    ])
    // A new one goes among those with as many people, in the picker's order.
    expect(toggleReaction(list, 'love', true).map((item) => item.reaction)).toEqual(['like', 'rocket', 'love', 'eyes'])
    expect(toggleReaction(list, 'love', true)[2]).toEqual({ reaction: 'love', count: 1, mine: true, names: [] })
    // Already so: nothing changes.
    expect(toggleReaction(list, 'rocket', true)).toBe(list)
    expect(toggleReaction(list, 'love', false)).toBe(list)
    expect(toggleReaction([{ reaction: 'love', count: 1, mine: true, names: [] }], 'love', false)).toEqual([])
  })
})

describe('circles: links in posts', () => {
  it('links http(s) addresses and keeps the rest as text', () => {
    expect(linkify('Try https://example.com/a?b=1, it works.')).toEqual([
      { text: 'Try ' },
      { href: 'https://example.com/a?b=1', text: 'https://example.com/a?b=1' },
      { text: ', it works.' },
    ])
    expect(linkify('HTTPS://EXAMPLE.COM')).toEqual([{ href: 'https://example.com/', text: 'HTTPS://EXAMPLE.COM' }])
  })

  it('ends an address at Chinese, Japanese or Korean text', () => {
    expect(linkify('链接：https://example.com/x很好用。')).toEqual([
      { text: '链接：' },
      { href: 'https://example.com/x', text: 'https://example.com/x' },
      { text: '很好用。' },
    ])
  })

  it('keeps a bracket the address opened, and leaves out one around it', () => {
    expect(linkify('https://en.wikipedia.org/wiki/Diffusion_(model)')[0]).toMatchObject({ text: 'https://en.wikipedia.org/wiki/Diffusion_(model)' })
    expect(linkify('(see https://example.com/x).')).toEqual([
      { text: '(see ' },
      { href: 'https://example.com/x', text: 'https://example.com/x' },
      { text: ').' },
    ])
  })

  it('never makes links of other schemes or markup', () => {
    expect(linkify('javascript:alert(1) ftp://example.com <a href="https://x">')).toEqual([
      { text: 'javascript:alert(1) ftp://example.com <a href="' },
      { href: 'https://x/', text: 'https://x' },
      { text: '">' },
    ])
    expect(linkify('<script>alert(1)</script>')).toEqual([{ text: '<script>alert(1)</script>' }])
    expect(linkify('')).toEqual([])
  })
})

describe('circles: comments', () => {
  it('reads a comment or a reply, cleaned like posts', () => {
    expect(parseCommentInput({ post: 45, body: '  好用\u200b！ ', locale: 'zh-Hans' })).toEqual({
      ok: true,
      value: { post: 45, body: '好用！', locale: 'zh-Hans', replyTo: null },
    })
    expect(parseCommentInput({ post: 45, body: 'Thanks', locale: 'en', replyTo: 12 })).toMatchObject({ ok: true, value: { replyTo: 12 } })
    expect(parseCommentInput({ post: 45, body: 'Thanks', locale: 'en', replyTo: null })).toMatchObject({ ok: true, value: { replyTo: null } })
  })

  it('turns down what is not a comment', () => {
    const long = 'あ'.repeat(commentRules.maxBody + 1)
    expect(parseCommentInput({ body: 'x', locale: 'en' })).toEqual({ ok: false, error: 'invalid-post' })
    expect(parseCommentInput({ post: '45', body: 'x', locale: 'en', replyTo: 'first' })).toEqual({ ok: false, error: 'invalid-reply' })
    expect(parseCommentInput({ post: 45, body: 'x', locale: 'en', replyTo: 0 })).toEqual({ ok: false, error: 'invalid-reply' })
    expect(parseCommentInput({ post: 45, body: ' \n ', locale: 'en' })).toEqual({ ok: false, error: 'empty-body' })
    expect(parseCommentInput({ post: 45, body: long, locale: 'ja' })).toEqual({ ok: false, error: 'body-too-long' })
    expect(parseCommentInput({ post: 45, body: long.slice(1), locale: 'ja' })).toMatchObject({ ok: true })
    expect(parseCommentInput({ post: 45, body: 'x', locale: 'fr' })).toEqual({ ok: false, error: 'invalid-locale' })
    expect(parseCommentInput(null)).toEqual({ ok: false, error: 'invalid-post' })
  })

  it('counts each commenter once in 推荐', () => {
    // Two people commenting weigh as four reactions.
    expect(hotScore({ people: 1, commenters: 2, hours: 5 })).toBe(hotScore({ people: 5, hours: 5 }))
    expect(hotScore({ people: 1, commenters: 2, hours: 5 })).toBeGreaterThan(hotScore({ people: 1, commenters: 1, hours: 5 }))
  })
})

describe('circles: link cards', () => {
  const origin = 'https://ifai.io'

  it('finds apps and Skills on IFAI, with or without the language prefix, each once', () => {
    const body = [
      'https://ifai.io/apps/cursor',
      'https://ifai.io/zh-hans/resources/skills/frontend-design/v/1.2.0',
      'https://ifai.io/ja/apps/cursor/',
      'https://ifai.io/resources/skills/frontend-design?tab=files#install',
      'https://ifai.io/ko/apps/notion',
    ].join(' 和 ')
    expect(siteLinks(body, origin)).toEqual([
      { kind: 'app', slug: 'cursor' },
      { kind: 'skill', slug: 'frontend-design' },
      { kind: 'app', slug: 'notion' },
    ])
  })

  it('leaves other sites and other pages as plain links', () => {
    expect(siteLinks('https://example.com/apps/cursor https://ifai.io.evil.com/apps/x http://ifai.io:8080/apps/y', origin)).toEqual([])
    expect(siteLinks('https://ifai.io/apps https://ifai.io/apps/category/coding https://ifai.io/fr/apps/x https://ifai.io/apps/Cursor', origin)).toEqual([])
    expect(siteLinks('https://ifai.io/daily/some-story https://ifai.io/resources/skills/x/files', origin)).toEqual([])
    expect(siteLinks('https://ifai.io/apps/cursor', 'not a url')).toEqual([])
  })

  it('looks up a few links at most', () => {
    const body = Array.from({ length: 15 }, (_, index) => `https://ifai.io/apps/app-${index}`).join(' ')
    expect(siteLinks(body, origin)).toHaveLength(10)
  })
})

describe('circles: a post’s page', () => {
  it('is canonical in the language the post is written in, English when that is none of the site’s', () => {
    expect(postPath(45)).toBe('/circles/p/45')
    expect(postLocale({ lang: 'ja' })).toBe('ja')
    expect(postLocale({ lang: 'zh-Hant' })).toBe('zh-Hant')
    expect(postLocale({ lang: 'und' })).toBe('en')
  })

  it('is titled with the start of the text, or where it was posted when it has none', () => {
    expect(postTitleValues({ body: '这周用同一套提示词跑了不同风格的插画，最喜欢第三张的配色。附上参数，欢迎一起调。' }, '半格', 'AI 绘画')).toEqual({
      name: '半格',
      circle: 'AI 绘画',
      excerpt: '这周用同一套提示词跑了不同风格的插画，最喜欢第三张的配色。附…',
      text: 'yes',
    })
    expect(postTitleValues({ body: '' }, '半格', 'AI 绘画')).toMatchObject({ text: 'no' })
  })

  it('cuts text on one line, by characters rather than UTF-16 units', () => {
    expect(excerpt('第一行\n\n  第二行  ', 60)).toBe('第一行 第二行')
    expect(excerpt('🎨'.repeat(5), 3)).toBe('🎨🎨🎨…')
    expect(excerpt('short', 5)).toBe('short')
  })
})
