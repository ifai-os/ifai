import { describe, expect, it } from 'vitest'

import {
  circleRules,
  hotCircleIds,
  hotScore,
  linkify,
  parseMembershipInput,
  parsePostInput,
  parseReactionInput,
  parseReportInput,
  parseTab,
  sortReactions,
  toggleReaction,
  type ReactionView,
} from '@/modules/circles/rules'

describe('circles: post input', () => {
  it('keeps line breaks, drops invisible characters and trims', () => {
    expect(parsePostInput({ circle: 3, body: '  First line\r\n\n\n\nsecond​  ', locale: 'zh-Hans' })).toEqual({
      ok: true,
      value: { circle: 3, body: 'First line\n\nsecond', locale: 'zh-Hans' },
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

  it('reads joins, reactions and reports, and nothing else', () => {
    expect(parseMembershipInput({ circle: 2, joined: false })).toEqual({ circle: 2, joined: false })
    expect(parseMembershipInput({ circle: 2, joined: 'yes' })).toBeNull()
    expect(parseReactionInput({ post: 9, reaction: 'rocket', on: true })).toEqual({ post: 9, reaction: 'rocket', on: true })
    expect(parseReactionInput({ post: 9, reaction: 'thumbs', on: true })).toBeNull()
    expect(parseReactionInput({ post: 9, reaction: 'like' })).toBeNull()
    expect(parseReportInput({ post: 9, reason: 'offTopic' })).toEqual({ post: 9, reason: 'offTopic' })
    expect(parseReportInput({ post: 9, reason: 'boring' })).toBeNull()
  })

  it('reads the tab from the address: 推荐 when there is none', () => {
    expect(parseTab(null)).toBe('hot')
    expect(parseTab('')).toBe('hot')
    expect(parseTab('latest')).toBe('latest')
    expect(parseTab('mine')).toBe('mine')
    expect(parseTab('following')).toBeNull()
  })
})

describe('circles: 推荐 and 热议', () => {
  it('ranks by the people who reacted, fading with age', () => {
    const fresh = hotScore({ people: 0, hours: 0 })
    expect(hotScore({ people: 3, hours: 0 })).toBeGreaterThan(fresh)
    expect(hotScore({ people: 3, hours: 30 })).toBeLessThan(hotScore({ people: 3, hours: 1 }))
    // A day-old post needs many more people than a new one.
    expect(hotScore({ people: 10, hours: 24 })).toBeLessThan(hotScore({ people: 1, hours: 1 }))
    expect(hotScore({ people: 0, comments: 1, hours: 2 })).toBe(hotScore({ people: 2, hours: 2 }))
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
