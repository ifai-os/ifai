import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import type { Locale } from '@/i18n/config'
import { charactersByFamily, posterFonts, posterWeights } from '@/modules/daily/poster/fonts'
import { frame, lineCount, MAX_SCALE, pieces, POSTER_SIZE, posterHeight, posterType, titleLines, type PosterTexts } from '@/modules/daily/poster/layout'
import { posterLogoSvg } from '@/modules/daily/poster/logo'
import {
  addCheck,
  arrangementProblem,
  autoPick,
  dayBounds,
  isPosterDate,
  POSTER_MAX,
  posterState,
  shiftDate,
  type PosterCandidate,
} from '@/modules/daily/poster/rules'
import { entryOf, posterVersion, readSnapshot, type PosterSnapshot } from '@/modules/daily/poster/snapshot'
import type { RawStory } from '@/modules/daily/public/story-item'

const story = (id: number, overrides: Partial<PosterCandidate> = {}): PosterCandidate => ({
  id,
  eventId: id,
  heat: 50,
  score: 80,
  publishedAt: '2026-10-21T02:00:00.000Z',
  source: `Source ${id}`,
  ...overrides,
})

const byId = (stories: PosterCandidate[]) => new Map(stories.map((item) => [item.id, item]))

describe('poster days', () => {
  it('takes real calendar dates only', () => {
    expect(isPosterDate('2026-10-21')).toBe(true)
    expect(isPosterDate('2028-02-29')).toBe(true)
    for (const value of ['2026-02-30', '2026-13-01', '2026-1-01', '20261021', '', null, 20261021]) expect(isPosterDate(value)).toBe(false)
  })

  it('runs from 00:00 to 24:00 Shanghai time', () => {
    const { start, end } = dayBounds('2026-10-21')
    expect(start.toISOString()).toBe('2026-10-20T16:00:00.000Z')
    expect(end.toISOString()).toBe('2026-10-21T16:00:00.000Z')
    expect(shiftDate('2026-10-31', 1)).toBe('2026-11-01')
    expect(shiftDate('2026-03-01', -1)).toBe('2026-02-28')
  })
})

describe('the automatic choice', () => {
  it('takes the hottest stories, one per event, at most two per source, eight at most', () => {
    const stories = [
      story(1, { heat: 90, source: 'OpenAI' }),
      story(2, { heat: 80, source: 'openai ' }),
      story(3, { heat: 70, source: 'OpenAI' }),
      story(4, { heat: 85, eventId: 1 }),
      ...Array.from({ length: 10 }, (_, index) => story(10 + index, { heat: 60 - index })),
    ]
    const picked = autoPick(stories)
    expect(picked).toHaveLength(POSTER_MAX)
    expect(picked.slice(0, 2)).toEqual([1, 2])
    // Story 3 is a third from OpenAI; story 4 shares story 1's event.
    expect(picked).not.toContain(3)
    expect(picked).not.toContain(4)
  })

  it('breaks ties by score, then the newer story', () => {
    const picked = autoPick([
      story(1, { heat: 10, score: 70 }),
      story(2, { heat: 10, score: 90 }),
      story(3, { heat: 10, score: 70, publishedAt: '2026-10-21T05:00:00.000Z' }),
    ])
    expect(picked).toEqual([2, 3, 1])
  })
})

describe('adding and arranging', () => {
  const stories = [story(1, { source: 'A' }), story(2, { source: 'A' }), story(3, { source: 'A' }), story(4, { eventId: 1 })]

  it('says why a story cannot join', () => {
    const all = byId(stories)
    expect(addCheck([1], stories[0], all)).toBe('present')
    expect(addCheck([1, 2], stories[2], all)).toBe('same_source')
    expect(addCheck([2], stories[3], all)).toBe('ok')
    // Story 4 shares story 1's event.
    expect(addCheck([1], stories[3], all)).toBe('same_event')
    const many = Array.from({ length: POSTER_MAX }, (_, index) => story(100 + index))
    expect(addCheck(many.map((item) => item.id), story(5), byId([...many, story(5)]))).toBe('full')
  })

  it('checks the list the editor sends', () => {
    const all = byId(stories)
    expect(arrangementProblem([2, 1], all)).toBeNull()
    expect(arrangementProblem([], all)).toBeNull()
    expect(arrangementProblem([1, 99], all)).toBe('unknown')
    expect(arrangementProblem([1, 1], all)).toBe('duplicate')
    expect(arrangementProblem([1, 4], all)).toBe('same_event')
    expect(arrangementProblem([1, 2, 3], all)).toBe('same_source')
    const many = Array.from({ length: POSTER_MAX + 1 }, (_, index) => story(100 + index))
    expect(arrangementProblem(many.map((item) => item.id), byId(many))).toBe('too_many')
  })
})

describe('poster state', () => {
  const correctedAt = new Map<number, string | null>([
    [1, null],
    [2, null],
  ])

  it('is empty, not generated, generated or out of date', () => {
    expect(posterState({ items: [], shown: null, generatedAt: null, correctedAt })).toBe('empty')
    expect(posterState({ items: [1, 2], shown: null, generatedAt: null, correctedAt })).toBe('idle')
    const generatedAt = '2026-10-21T10:00:00.000Z'
    expect(posterState({ items: [1, 2], shown: [1, 2], generatedAt, correctedAt })).toBe('generated')
    expect(posterState({ items: [2, 1], shown: [1, 2], generatedAt, correctedAt })).toBe('stale')
    expect(posterState({ items: [1], shown: [1, 2], generatedAt, correctedAt })).toBe('stale')
    const corrected = new Map(correctedAt).set(2, '2026-10-21T11:00:00.000Z')
    expect(posterState({ items: [1, 2], shown: [1, 2], generatedAt, correctedAt: corrected })).toBe('stale')
    const before = new Map(correctedAt).set(2, '2026-10-21T09:00:00.000Z')
    expect(posterState({ items: [1, 2], shown: [1, 2], generatedAt, correctedAt: before })).toBe('generated')
  })
})

describe('the frozen content', () => {
  const raw = {
    id: 7,
    slug: 'acme-ships-model-2',
    category: 'llm',
    title: { en: 'Acme ships Model 2', 'zh-Hans': 'Acme 发布 Model 2', 'zh-Hant': 'Acme 發布 Model 2' },
    summary: { en: 'Out today.', 'zh-Hans': '今天发布。' },
    sources: [
      { name: 'Tech News', role: 'report', url: 'https://news.example/a' },
      { name: 'Acme', role: 'original', url: 'https://acme.example/blog' },
    ],
    eventId: 3,
    publishedAt: '2026-10-21T02:00:00.000Z',
    createdAt: '2026-10-21T01:00:00.000Z',
  } as unknown as RawStory

  it('keeps every language, English where one is missing, and the original publisher', () => {
    const entry = entryOf(raw)
    expect(entry.source).toBe('Acme')
    expect(entry.title.ja).toEqual({ value: 'Acme ships Model 2', lang: 'en' })
    expect(entry.title['zh-Hant']).toEqual({ value: 'Acme 發布 Model 2', lang: 'zh-Hant' })
    expect(entry.summary.ko).toEqual({ value: 'Out today.', lang: 'en' })
  })

  it('reads back only a snapshot in the right shape', () => {
    const snapshot: PosterSnapshot = { date: '2026-10-21', generatedAt: '2026-10-21T10:00:00.000Z', updatedAt: '2026-10-21T10:00:00.000Z', entries: [entryOf(raw)] }
    expect(readSnapshot(JSON.parse(JSON.stringify(snapshot)))).toEqual(snapshot)
    expect(readSnapshot(null)).toBeNull()
    expect(readSnapshot({ ...snapshot, entries: [{ ...snapshot.entries[0], category: 7 }] })).toBeNull()
    // Posters generated before the categories changed (2026-10-24) keep the former ones; they read as the new ones.
    expect(readSnapshot({ ...snapshot, entries: [{ ...snapshot.entries[0], category: 'design' }] })?.entries[0].category).toBe('aigc')
    expect(readSnapshot({ ...snapshot, updatedAt: undefined })).toBeNull()
  })

  it('changes its version when the images change', () => {
    const first = posterVersion({ updatedAt: '2026-10-21T10:00:00.000Z' })
    expect(first).toMatch(/^[0-9a-z]+$/)
    expect(posterVersion({ updatedAt: '2026-10-21T10:05:00.000Z' })).not.toBe(first)
  })
})

describe('line breaking', () => {
  it('breaks Latin at spaces and hyphens, Chinese and Japanese between characters, Korean at spaces', () => {
    expect(pieces('real-time team')).toHaveLength(3)
    expect(pieces('OpenAI 上线 Slides')).toHaveLength(4)
    // No line starts with a closing mark or ends with an opening one.
    expect(pieces('上线，（测试）').map((piece) => piece.width)).toEqual([1, 2, 2, 2])
    expect(pieces('팀 실시간 협업', true)).toHaveLength(3)
    expect(pieces('팀실시간협업', true)).toHaveLength(1)
  })

  it('counts lines like greedy wrapping', () => {
    expect(lineCount('', 40, 800)).toBe(0)
    expect(lineCount('短标题', 40, 800)).toBe(1)
    // 40 CJK characters at 40px are 1600px: two lines of 800px.
    expect(lineCount('字'.repeat(40), 40, 800)).toBe(2)
    expect(lineCount('字'.repeat(41), 40, 800)).toBe(3)
  })
})

describe('poster type sizes', () => {
  const text = (value: string, lang: Locale = 'en') => ({ value, lang })
  const longTitle = text('Microsoft Research publishes a long-document summarization benchmark covering ten models')
  const texts = (stories: number, title = longTitle): PosterTexts => ({
    headTitle: title,
    summary: text('ChatGPT can now turn a chat or a document into a slide deck. Teammates edit the same deck at once, and the AI revises the pages you comment on.'),
    stories: Array.from({ length: stories - 1 }, () => ({ title, brief: text('The weights can be downloaded and used commercially.') })),
  })

  it('gives few stories big type and a line of summary each', () => {
    const type = posterType(texts(3, text('Short title')))
    expect(type.briefLines).toBeGreaterThan(0)
    expect(type.headTitle).toBe(Math.round(56 * MAX_SCALE))
  })

  it('keeps every title whole when a smaller size shows all of it', () => {
    const head = text('OpenAI launches ChatGPT Slides with real-time team editing and revisions from comments')
    const type = posterType({ ...texts(2), headTitle: head })
    const width = POSTER_SIZE.width - 2 * frame.side - 2 * frame.cardPad
    expect(type.headTitle).toBeLessThan(Math.round(56 * MAX_SCALE))
    expect(lineCount(head.value, type.headTitle, width)).toBeLessThanOrEqual(titleLines.head)
  })

  it('gives eight long titles smaller type, and always fits', () => {
    const few = posterType(texts(3))
    const many = posterType(texts(8))
    expect(many.briefLines).toBe(0)
    expect(many.title).toBeLessThan(few.title)
    for (const count of [1, 3, 5, 8]) expect(posterHeight(texts(count), posterType(texts(count)))).toBeLessThanOrEqual(POSTER_SIZE.height)
  })
})

describe('poster fonts', () => {
  it('groups the characters by font family', () => {
    const families = charactersByFamily([
      { lang: 'en', text: 'Ab\nA' },
      { lang: 'zh-Hans', text: '头条' },
      { lang: 'zh-Hant', text: '頭條' },
    ])
    expect([...families.keys()]).toEqual(['Noto Sans', 'Noto Sans SC', 'Noto Sans TC'])
    expect(families.get('Noto Sans')).toBe('Ab')
  })

  it('loads both weights of each family from Google Fonts and fails when one is missing', async () => {
    const requested: string[] = []
    const fetcher = (async (input: string | URL | Request) => {
      const url = String(input)
      requested.push(url)
      if (url.startsWith('https://fonts.googleapis.com/')) {
        return new Response(`@font-face { src: url(https://fonts.gstatic.example/${requested.length}.ttf) format('truetype'); }`)
      }
      return new Response(new Uint8Array([1, 2, 3]))
    }) as typeof fetch
    const fonts = await posterFonts([{ lang: 'ja', text: 'トップ' }], fetcher)
    expect(fonts.map((font) => [font.name, font.weight])).toEqual(posterWeights.map((weight) => ['Noto Sans JP', weight]))
    const cut = requested.filter((url) => url.startsWith('https://fonts.googleapis.com/')).map((url) => new URL(url).searchParams.get('text'))
    expect(cut).toEqual(['ットプ', 'ットプ'])

    const missing = (async () => new Response('', { status: 400 })) as typeof fetch
    await expect(posterFonts([{ lang: 'en', text: 'A' }], missing)).rejects.toThrow('Noto Sans')
  })
})

describe('the poster logo', () => {
  it('is the dark icon from public/brand', () => {
    const file = readFileSync(new URL('../../../public/brand/ifai-icon-dark.svg', import.meta.url), 'utf8')
    expect(posterLogoSvg.trim()).toBe(file.trim())
  })
})
