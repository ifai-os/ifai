import { NextIntlClientProvider } from 'next-intl'
import type { ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { inAnyLanguage } from '@/lib/i18n/localized'
import { dateOfKey, dayKey, groupByDay, readerTimeZone, relativeDay } from '@/lib/local-time'
import { DailyFeed } from '@/modules/daily/public/components/daily-feed'
import { HotList } from '@/modules/daily/public/components/hot-list'
import { HottestCard } from '@/modules/daily/public/components/hottest-card'
import { CategoryPageView } from '@/modules/daily/public/components/category-page'
import { MentionedApps } from '@/modules/daily/public/components/mentioned-apps'
import { StoryDetailView } from '@/modules/daily/public/components/story-detail'
import { TodayHeadlines } from '@/modules/daily/public/components/today-headlines'
import { TopicPageView } from '@/modules/daily/public/components/topic-page'
import { listHref, readPage, readTopicKey, storyHref, topicHref } from '@/modules/daily/public/list-params'
import { renderFeed } from '@/modules/daily/public/rss'
import { storyCategoryOf } from '@/modules/daily/categories'
import {
  bodyBlocks,
  bodyOf,
  onePerEvent,
  pickHeadline,
  toHot,
  toItem,
  type CategoryPage,
  type HotStory,
  type RawStory,
  type StoryDetail,
  type StoryItem,
  type TopicPage,
} from '@/modules/daily/public/story-item'

import en from '../../../messages/en.json'

const render = (element: ReactElement) =>
  renderToStaticMarkup(
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      {element}
    </NextIntlClientProvider>,
  )

const story = (overrides: Partial<StoryItem> & Pick<StoryItem, 'id' | 'publishedAt'>): StoryItem => ({
  slug: `story-${overrides.id}`,
  category: 'tools',
  correctedAt: null,
  title: { value: `Story ${overrides.id}`, lang: 'en' },
  summary: { value: 'What happened, in one line.', lang: 'en' },
  tryIt: null,
  moreReports: 0,
  spread: 0,
  originalName: 'Maker',
  media: null,
  ...overrides,
})

describe('calendar days in a time zone', () => {
  it('names the local date of an instant', () => {
    const instant = new Date('2026-10-22T23:30:00Z')
    expect(dayKey(instant, 'UTC')).toBe('2026-10-22')
    expect(dayKey(instant, 'Asia/Shanghai')).toBe('2026-10-23')
    expect(dayKey(instant, 'America/Los_Angeles')).toBe('2026-10-22')
    expect(dateOfKey('2026-10-23').toISOString()).toBe('2026-10-23T00:00:00.000Z')
  })

  it('groups stories into runs of the same local day', () => {
    const items = [
      story({ id: 1, publishedAt: '2026-10-22T23:30:00Z' }),
      story({ id: 2, publishedAt: '2026-10-22T12:00:00Z' }),
      story({ id: 3, publishedAt: '2026-10-21T02:00:00Z' }),
    ]
    const utc = groupByDay(items, (item) => item.publishedAt, 'UTC')
    expect(utc.map((group) => [group.key, group.items.map((item) => item.id)])).toEqual([
      ['2026-10-22', [1, 2]],
      ['2026-10-21', [3]],
    ])
    const tokyo = groupByDay(items, (item) => item.publishedAt, 'Asia/Tokyo')
    expect(tokyo.map((group) => [group.key, group.items.map((item) => item.id)])).toEqual([
      ['2026-10-23', [1]],
      ['2026-10-22', [2]],
      ['2026-10-21', [3]],
    ])
  })

  it('tells today and yesterday apart from older days', () => {
    expect(relativeDay('2026-10-22', '2026-10-22')).toBe('today')
    expect(relativeDay('2026-10-21', '2026-10-22')).toBe('yesterday')
    expect(relativeDay('2026-10-20', '2026-10-22')).toBeNull()
    expect(relativeDay('2026-10-31', '2026-11-01')).toBe('yesterday')
  })

  it('reads a real zone from the runtime', () => {
    expect(() => new Intl.DateTimeFormat('en-US', { timeZone: readerTimeZone() })).not.toThrow()
  })
})

describe('list addresses', () => {
  it('reads the page and refuses anything but a whole number from 1', () => {
    expect(readPage({})).toBe(1)
    expect(readPage({ page: '3' })).toBe(3)
    for (const page of ['0', '-1', '1.5', '01', 'two', '999999']) expect(readPage({ page })).toBeNull()
  })

  it('builds list and story addresses', () => {
    expect(listHref()).toBe('/news')
    expect(listHref({ category: 'open' })).toBe('/news/category/open')
    expect(listHref({ category: 'open', page: 2 })).toBe('/news/category/open?page=2')
    expect(listHref({ page: 1 })).toBe('/news')
    expect(storyHref('a-story')).toBe('/news/a-story')
  })
})

describe('a story in the reader’s language', () => {
  const raw = {
    id: 7,
    slug: 'a-story',
    category: 'open',
    status: 'published',
    eventId: 1,
    representativeItemId: 1,
    publishedAt: '2026-10-22T09:42:00.000Z',
    correctedAt: null,
    createdAt: '2026-10-22T09:00:00.000Z',
    updatedAt: '2026-10-22T09:42:00.000Z',
    title: { en: 'An open model', 'zh-Hans': '一个开源模型', 'zh-Hant': '一個開源模型' },
    summary: { en: 'It is open.', 'zh-Hans': '它是开源的。' },
    tryIt: { en: '', 'zh-Hans': '下载试试。' },
    sources: [
      { name: 'Maker', role: 'original', url: 'https://maker.example/post', publishedAt: '2026-10-22T08:00:00.000Z' },
      { name: 'Outlet A', role: 'report', url: 'https://a.example/x', publishedAt: null },
      { name: 'Outlet B', role: 'report', url: 'https://b.example/y', publishedAt: null },
      { name: 'Hacker News', role: 'discussion', url: 'https://news.ycombinator.com/item?id=1', publishedAt: null },
    ],
  } as unknown as RawStory

  it('picks the reader’s language, falling back to English and saying so', () => {
    const hans = toItem(raw, 'zh-Hans')
    expect(hans.title).toEqual({ value: '一个开源模型', lang: 'zh-Hans' })
    expect(hans.tryIt).toEqual({ value: '下载试试。', lang: 'zh-Hans' })
    const ko = toItem(raw, 'ko')
    expect(ko.title).toEqual({ value: 'An open model', lang: 'en' })
    expect(ko.summary).toEqual({ value: 'It is open.', lang: 'en' })
    expect(ko.tryIt).toBeNull()
  })

  it('counts the other reports and names the original publisher', () => {
    const item = toItem(raw, 'en')
    expect(item.moreReports).toBe(2)
    expect(item.originalName).toBe('Maker')
    expect(item.publishedAt).toBe('2026-10-22T09:42:00.000Z')
  })

  it('gives a hot story its heat and mark, and every story the highest heat it reached as its reach index', () => {
    const hot = toHot({ ...raw, heat: 71.3, heatPeak: 64.2, heatTrend: 'rising' } as RawStory, 'en')
    expect(hot).toMatchObject({ eventId: 1, heat: 71.3, trend: 'rising', spread: 71 })
    // Past the 48 hours the heat is 0 but the reach index stays.
    expect(toItem({ ...raw, heat: 0, heatPeak: 88.6 } as RawStory, 'en').spread).toBe(89)
    expect(toHot({ ...raw, sources: [] } as RawStory, 'en')).toMatchObject({ heat: 0, trend: null, spread: 0 })
  })

  it('shows a title in any language rather than none', () => {
    expect(inAnyLanguage({ 'zh-Hans': '只有中文' }, 'ja')).toEqual({ value: '只有中文', lang: 'zh-Hans' })
    expect(inAnyLanguage({ en: ' ' }, 'ja')).toBeNull()
  })
})

describe('the daily feed', () => {
  it('renders in UTC on the server, with the instant in datetime for the browser to re-group', () => {
    const html = render(
      <DailyFeed
        stories={[
          story({ id: 1, publishedAt: '2026-10-22T23:30:00Z', spread: 64, tryIt: { value: 'Open the app.', lang: 'en' } }),
          story({ id: 2, publishedAt: '2026-10-21T02:00:00Z', title: { value: '一个开源模型', lang: 'zh-Hans' } }),
        ]}
        serverToday="2026-10-22"
      />,
    )
    expect(html).toContain(`>${en.daily.today}<`)
    expect(html).toContain(`>${en.daily.yesterday}<`)
    // React writes the attribute as dateTime; HTML attribute names are case-insensitive.
    expect(html).toContain('dateTime="2026-10-22T23:30:00Z"')
    expect(html).toContain('11:30 PM')
    // The reach index in its tier's colour instead of the other reports (站长, 2026-10-27).
    expect(html).toContain(`${en.card.spread} <span class="font-semibold tabular-nums text-heat-3">64</span>`)
    // A bolt before it, in the same colour.
    expect(html).toMatch(/<svg[^>]*class="flex-none text-heat-3"[^>]*><path d="M13 2.5/)
    expect(html).not.toContain('more outlets')
    // No「试一试」in the list (站长, 2026-10-27).
    expect(html.match(new RegExp(en.card.spread, 'g'))).toHaveLength(1)
    expect(html).not.toContain('Open the app.')
    expect(html).toContain('lang="zh-Hans"')
    expect(html).toContain('href="/en/news/story-2"')
    // The category leads to its page (站长, 2026-10-27).
    expect(html).toContain('href="/en/news/category/tools"')
  })
})

describe('the hottest events', () => {
  const hot = (overrides: Partial<HotStory> & Pick<HotStory, 'id' | 'eventId'>): HotStory => ({
    ...story({ id: overrides.id, publishedAt: '2026-10-22T09:00:00Z' }),
    heat: 50,
    trend: null,
    ...overrides,
  })

  it('keeps the first story of each event', () => {
    const stories = [hot({ id: 1, eventId: 7 }), hot({ id: 2, eventId: 7 }), hot({ id: 3, eventId: 8 }), hot({ id: 4, eventId: 9 })]
    expect(onePerEvent(stories, 2).map((item) => item.id)).toEqual([1, 3])
  })

  it('ranks them with the reach index and the rising and new marks', () => {
    const html = render(
      <HotList
        stories={[
          hot({ id: 1, eventId: 1, spread: 92, trend: 'rising' }),
          hot({ id: 2, eventId: 2, spread: 71, trend: 'new' }),
          hot({ id: 3, eventId: 3, spread: 53 }),
          hot({ id: 4, eventId: 4, spread: 22 }),
        ]}
      />,
    )
    expect(html).toContain(`>${en.daily.hotTitle}</h2>`)
    // Cold to hot: green, orange, red, magenta.
    expect(html).toContain('text-heat-4">92<')
    expect(html).toContain('text-heat-3">71<')
    expect(html).toContain('text-heat-2">53<')
    expect(html).toContain('text-heat-1">22<')
    expect(html).not.toContain('outlet')
    // The bolt stands for the label; the words stay for screen readers and as the tooltip.
    expect(html).toContain(`title="${en.card.spread}"`)
    expect(html).toContain(`<span class="sr-only">${en.card.spread}</span>`)
    expect(html).toContain(`>${en.daily.trend.rising}</span>`)
    expect(html).toContain(`>${en.daily.trend.new}</span>`)
    expect(html).toContain('href="/en/news/story-3"')
    // The first three ranks stand out.
    expect(html.match(/tabular-nums text-accent/g)).toHaveLength(3)
  })

  it('picks the top story, never leaving it empty while something is published', () => {
    const now = new Date('2026-10-27T08:00:00Z')
    const day = 24 * 3_600_000
    const old = hot({ id: 1, eventId: 1, publishedAt: '2026-10-25T09:00:00Z' })
    const fresh = hot({ id: 2, eventId: 2, publishedAt: '2026-10-27T01:00:00Z' })
    const newest = hot({ id: 3, eventId: 3, publishedAt: '2026-10-24T09:00:00Z' })
    // The hottest of the last 24 hours, even when an older story is hotter.
    expect(pickHeadline([old, fresh], [newest], now, day)?.id).toBe(2)
    // None in the last 24 hours: the hottest there is.
    expect(pickHeadline([old], [newest], now, day)?.id).toBe(1)
    // Nothing has heat: the newest story.
    expect(pickHeadline([], [newest], now, day)?.id).toBe(3)
    expect(pickHeadline([], [], now, day)).toBeNull()
  })

  it("leads with today's hottest story, the whole card a link to it", () => {
    const html = render(<HottestCard story={hot({ id: 5, eventId: 5, spread: 81 })} category="Product" />)
    expect(html).toContain(`${en.daily.hottest} · Product`)
    expect(html).toContain(`<span>${en.card.spread} <span class="font-semibold tabular-nums">81</span></span>`)
    expect(html).toContain('href="/en/news/story-5"')
    // The title only, no summary (站长, 2026-10-27).
    expect(html).not.toContain('What happened, in one line.')
  })
})

describe('apps in today’s news', () => {
  const app = (id: number, mentionedAt: string) => ({ id, slug: `app-${id}`, name: `App ${id}`, logo: null, mentionedAt })

  it('shows the apps of the server’s today, linked to their pages', () => {
    const html = render(<MentionedApps apps={[app(1, '2026-10-22T09:00:00Z'), app(2, '2026-10-21T23:00:00Z')]} serverToday="2026-10-22" />)
    expect(html).toContain(`>${en.daily.appsToday.replace("'", '&#x27;')}</h2>`)
    expect(html).toContain('href="/en/apps/app-1"')
    expect(html).not.toContain('App 2')
  })

  it('shows nothing when no story of today names an app', () => {
    expect(render(<MentionedApps apps={[app(2, '2026-10-21T23:00:00Z')]} serverToday="2026-10-22" />)).toBe('')
  })
})

describe('「今天的 AI」on the home page', () => {
  it('lists the stories of the server’s today and says when it was updated', () => {
    const html = render(
      <TodayHeadlines
        stories={[story({ id: 1, publishedAt: '2026-10-22T09:42:00Z' }), story({ id: 2, publishedAt: '2026-10-21T09:00:00Z' })]}
        serverToday="2026-10-22"
      />,
    )
    expect(html).toContain('1 story published today · updated 9:42 AM')
    expect(html).toContain('Story 1')
    expect(html).not.toContain('Story 2')
  })

  it('falls back to the latest day with stories, then to a note', () => {
    const html = render(<TodayHeadlines stories={[story({ id: 2, publishedAt: '2026-10-20T09:00:00Z' })]} serverToday="2026-10-22" />)
    expect(html).toContain('Latest stories from October 20 · 1 story')
    expect(render(<TodayHeadlines stories={[]} serverToday="2026-10-22" />)).toContain(en.home.dailyEmpty)
  })
})

describe('a story’s page', () => {
  const detail: StoryDetail = {
    ...story({ id: 1, publishedAt: '2026-10-22T09:42:00Z', correctedAt: '2026-10-22T12:00:00Z', spread: 85 }),
    body: null,
    sources: [
      { name: 'Maker', role: 'original', url: 'https://www.maker.example/post', publishedAt: '2026-10-22T08:00:00Z' },
      { name: 'Outlet', role: 'report', url: 'https://outlet.example/x', publishedAt: null },
    ],
    developments: [story({ id: 9, publishedAt: '2026-10-20T09:00:00Z', slug: 'earlier' })],
    tags: [],
    entities: [],
    topic: null,
    similar: [],
  }

  it('lists the sources in order with their role, and the other developments', () => {
    const html = render(<StoryDetailView story={detail} signIn={{ google: false, github: false, email: true }} />)
    expect(html.indexOf('Maker')).toBeLessThan(html.indexOf('Outlet'))
    expect(html).toContain('href="https://www.maker.example/post" target="_blank" rel="noopener"')
    expect(html).toContain(`>${en.daily.roles.original}<`)
    expect(html).toContain('maker.example')
    expect(html).toContain(`>${en.daily.corrected} <time dateTime="2026-10-22T12:00:00Z">`)
    expect(html).toContain('href="/en/news/earlier"')
    expect(html).toContain('text-heat-4">85<')
  })

  it('shows the body after the summary, with its paragraphs and subheadings', () => {
    const body = { lang: 'en' as const, value: bodyBlocks('First paragraph.\n\n## What changes\nSecond paragraph,\nsame paragraph.\n\n\nThird.') }
    expect(body.value).toEqual([
      { kind: 'paragraph', text: 'First paragraph.' },
      { kind: 'heading', text: 'What changes' },
      { kind: 'paragraph', text: 'Second paragraph,\nsame paragraph.' },
      { kind: 'paragraph', text: 'Third.' },
    ])
    const html = render(<StoryDetailView story={{ ...detail, body }} signIn={{ google: false, github: false, email: true }} />)
    expect(html).toContain('<div lang="en" class="flex flex-col gap-5 text-body-article text-ink">')
    expect(html).toContain('<h2 class="pt-2 text-h3 font-semibold">What changes</h2>')
    expect(html.indexOf(detail.summary?.value ?? '')).toBeLessThan(html.indexOf('First paragraph.'))
    expect(html.indexOf('Third.')).toBeLessThan(html.indexOf(en.daily.sources))
    expect(bodyBlocks('  \n\n ')).toEqual([])
    expect(bodyOf({ body: { en: 'Only English.' } }, 'ja')).toEqual({ lang: 'en', value: [{ kind: 'paragraph', text: 'Only English.' }] })
    expect(bodyOf({ body: { en: ' ' } }, 'en')).toBeNull()
  })

  it('leaves out the related blocks it has nothing for', () => {
    const html = render(<StoryDetailView story={detail} signIn={{ google: false, github: false, email: true }} />)
    for (const heading of [en.daily.tags, en.daily.entities, en.daily.topic, en.daily.similar]) expect(html).not.toContain(heading)
  })

  it('shows the industry tags, companies and products, the topic and similar events', () => {
    const topicStories = [
      story({ id: 20, publishedAt: '2026-10-23T09:00:00Z', slug: 'newer' }),
      { ...detail, sources: undefined },
      ...[1, 2, 3, 4, 5].map((n) => story({ id: 20 + n, publishedAt: `2026-10-0${n}T09:00:00Z`, slug: `old-${n}` })),
    ]
    const html = render(
      <StoryDetailView
        story={{
          ...detail,
          tags: ['hardware', 'chips'],
          entities: [
            { name: 'MacBook Pro', kind: 'product', key: 'macbookpro', app: null },
            { name: 'Apple', kind: 'company', key: 'apple', app: { slug: 'apple-intelligence', name: 'Apple Intelligence' } },
          ],
          topic: { name: 'MacBook Pro', key: 'macbookpro', stories: topicStories },
          similar: [story({ id: 30, publishedAt: '2025-10-01T09:00:00Z', slug: 'last-year' })],
        }}
        signIn={{ google: false, github: false, email: true }}
      />,
    )
    expect(html).toContain(`href="/en/news/tag/hardware"`)
    expect(html).toContain(`>${en.tags.hardware}`)
    expect(html).toContain(`>${en.follows.tagsNote}<`)
    expect(html).toContain(`>${en.daily.entityKinds.product}<`)
    expect(html).toContain('href="/en/apps/apple-intelligence"')
    expect(html).toContain('href="/en/news/topic/apple"')
    expect(html).toContain('href="/en/news/topic/macbookpro"')
    // This story is marked, not linked; five of seven show before「查看更多」.
    expect(html).toContain(`>${en.daily.thisStory}<`)
    expect(html).not.toContain('href="/en/news/story-1"')
    expect(html).toContain('href="/en/news/old-3"')
    expect(html).not.toContain('href="/en/news/old-4"')
    expect(html).toContain('Show more (2)')
    expect(html).toContain('href="/en/news/last-year"')
    expect(html.indexOf(en.daily.topic)).toBeLessThan(html.indexOf(en.daily.similar))
  })

  it('offers to follow each tag, the topic, and the companies and products the topic tracker does not cover', () => {
    const entities: StoryDetail['entities'] = [
      { name: 'MacBook Pro', kind: 'product', key: 'macbookpro', app: null },
      { name: 'Apple', kind: 'company', key: 'apple', app: null },
    ]
    const signIn = { google: false, github: false, email: true }
    const topic = { name: 'MacBook Pro', key: 'macbookpro', stories: [story({ id: 20, publishedAt: '2026-10-23T09:00:00Z' })] }
    const html = render(<StoryDetailView story={{ ...detail, tags: ['hardware'], entities, topic }} signIn={signIn} />)
    expect(html).toMatch(/aria-pressed="false" aria-label="Follow AI hardware"[^>]*><span aria-hidden="true">\+<\/span>Follow<\/button>/)
    expect(html).toContain(`>${en.follows.followTopic}</button>`)
    expect(html).toContain('aria-label="Follow Apple"')
    // The topic tracker's button follows MacBook Pro, so its row has none.
    expect(html).not.toContain('aria-label="Follow MacBook Pro"')

    const alone = render(<StoryDetailView story={{ ...detail, tags: [], entities, topic: null }} signIn={signIn} />)
    expect(alone).toContain('aria-label="Follow MacBook Pro"')
    expect(alone).not.toContain(en.follows.followTopic)
  })

  it('has a save button next to share', () => {
    const html = render(<StoryDetailView story={detail} signIn={{ google: false, github: false, email: true }} />)
    expect(html).toContain(`aria-pressed="false"`)
    expect(html.indexOf(`>${en.saves.save}</button>`)).toBeLessThan(html.indexOf(en.daily.share))
  })
})

describe('a company’s or product’s topic page', () => {
  const topic: TopicPage = {
    key: 'kimi',
    name: 'Kimi',
    kind: 'product',
    total: 23,
    page: 1,
    pages: 2,
    stories: [
      story({ id: 1, publishedAt: '2026-10-22T09:40:00Z', slug: 'k3', spread: 66 }),
      story({ id: 2, publishedAt: '2026-09-11T20:15:00Z', slug: 'k28' }),
      story({ id: 3, publishedAt: '2025-11-06T22:05:00Z', slug: 'k2-thinking' }),
    ],
    earlier: 3,
    app: { slug: 'kimi', name: 'Kimi', logo: null },
    developer: { name: 'Moonshot AI', key: 'moonshotai' },
  }

  it('has addresses only for compared names', () => {
    expect(topicHref('kimi')).toBe('/news/topic/kimi')
    expect(topicHref('月之暗面', 2)).toBe('/news/topic/%E6%9C%88%E4%B9%8B%E6%9A%97%E9%9D%A2?page=2')
    expect(readTopicKey('kimi')).toBe('kimi')
    expect(readTopicKey('%E6%9C%88%E4%B9%8B%E6%9A%97%E9%9D%A2')).toBe('月之暗面')
    expect(readTopicKey('月之暗面')).toBe('月之暗面')
    expect(readTopicKey('Kimi')).toBeNull()
    expect(readTopicKey('kimi%20k2')).toBeNull()
    expect(readTopicKey('%E0%A4%A')).toBeNull()
    expect(readTopicKey('')).toBeNull()
  })

  it('names it, links its maker and app, and lists the stories under their times', () => {
    const html = render(<TopicPageView topic={topic} serverToday="2026-10-22" signIn={{ google: false, github: false, email: true }} />)
    expect(html).toContain('>#</span>Kimi</h1>')
    expect(html).toContain(`>${en.daily.entityKinds.product}<`)
    expect(html).toMatch(/Made by <a [^>]*href="\/en\/news\/topic\/moonshotai">Moonshot AI<\/a>/)
    expect(html).toContain('23 stories')
    expect(html).toContain('href="/en/apps/kimi"')
    // Today by name, this year without the year, earlier years with it.
    expect(html).toContain('<span>Today</span><span class="tabular-nums">9:40 AM</span>')
    expect(html).toContain('<span>September 11</span>')
    expect(html).toContain('<span>November 6, 2025</span>')
    expect(html).toContain('text-heat-3">66<')
    expect(html).toContain('href="/en/news/topic/kimi?page=2"')
    expect(html).toContain('Load earlier stories (3)')
    // 「+ 关注」at the top; the follower count is read in the browser, so none yet.
    expect(html).toContain('aria-label="Follow Kimi"')
    expect(html).not.toContain('follower')
  })

  it('says when there is nothing earlier, and leaves out a maker it does not know', () => {
    const html = render(
      <TopicPageView
        topic={{ ...topic, page: 2, earlier: 0, developer: null, app: null }}
        serverToday="2026-10-22"
        signIn={{ google: false, github: false, email: true }}
      />,
    )
    expect(html).toContain(en.daily.noEarlier)
    expect(html).toContain('href="/en/news/topic/kimi"')
    expect(html).not.toContain('Made by')
    expect(html).not.toContain('/en/apps/')
  })
})

describe('a category page', () => {
  const page: CategoryPage = {
    category: 'tools',
    total: 23,
    page: 1,
    pages: 2,
    stories: [
      story({ id: 1, publishedAt: '2026-10-22T09:40:00Z', slug: 'workspaces', spread: 45, tryIt: { value: 'Invite a teammate.', lang: 'en' } }),
      story({ id: 2, publishedAt: '2026-10-21T20:15:00Z', slug: 'preview' }),
    ],
    week: 18,
    latest: '2026-10-22T09:40:00Z',
  }

  it('reads the former categories as the new ones', () => {
    expect(storyCategoryOf('product')).toBe('tools')
    expect(storyCategoryOf('design')).toBe('aigc')
    expect(storyCategoryOf('open')).toBe('open')
    expect(storyCategoryOf('gossip')).toBe('industry')
    expect(storyCategoryOf(undefined)).toBe('industry')
  })

  it('heads the cards with the banner: #name, what it covers, the week and the newest time', () => {
    const html = render(<CategoryPageView page={page} serverToday="2026-10-22" />)
    expect(html).toContain('>#</span>AI tools</h1>')
    expect(html).toContain(en.categoryAbout.tools)
    expect(html).toContain('18 stories in the last 7 days')
    expect(html).toContain('updated 9:40 AM')
    // Every category as a pill, this one current; no category name on its own cards.
    const current = html.match(/<a [^>]*aria-current="page"[^>]*>([^<]*)<\/a>/)
    expect(current?.[0]).toContain('href="/en/news/category/tools"')
    expect(current?.[1]).toBe(en.categories.tools)
    // The name shows in the title and the pill only.
    expect(html.split(`>${en.categories.tools}<`)).toHaveLength(3)
    expect(html).toContain('<span>Today</span><span class="tabular-nums">9:40 AM</span>')
    expect(html).not.toContain('Invite a teammate.')
    expect(html).toContain('text-heat-2">45<')
    // A story that never had any heat shows no reach index.
    expect(html.match(new RegExp(`${en.card.spread} `, 'g'))).toHaveLength(1)
    expect(html).toContain('href="/en/news/category/tools?page=2"')
    expect(html).toContain(en.daily.loadEarlier)
  })

  it('names an older update by its day, links the newer page, and says when there is nothing earlier', () => {
    const html = render(<CategoryPageView page={{ ...page, page: 2, latest: '2026-10-21T20:15:00Z' }} serverToday="2026-10-22" />)
    expect(html).toContain('updated yesterday at 8:15 PM')
    expect(html).toMatch(/<a [^>]*href="\/en\/news\/category\/tools"[^>]*>Newer stories<\/a>|<a [^>]*rel="prev"[^>]*href="\/en\/news\/category\/tools"/)
    expect(html).toContain(en.daily.noEarlier)
    expect(html).not.toContain('?page=3')
  })

  it('shows the empty state while the category has no stories', () => {
    const html = render(<CategoryPageView page={{ ...page, total: 0, pages: 0, stories: [], week: 0, latest: null }} serverToday="2026-10-22" />)
    expect(html).toContain(en.daily.emptyCategoryTitle)
    expect(html).toContain('href="/en/news"')
    expect(html).not.toContain('in the last 7 days')
    expect(html).not.toContain(en.daily.noEarlier)
  })
})

describe('the RSS feed', () => {
  it('links every story to its page in the feed’s language and escapes the text', () => {
    const xml = renderFeed({
      locale: 'ja',
      stories: [
        story({ id: 1, publishedAt: '2026-10-22T09:42:00Z', summary: { value: 'A <b>bold</b> claim & more', lang: 'en' } }),
        story({ id: 2, publishedAt: '2026-10-21T09:00:00Z', correctedAt: '2026-10-23T01:00:00Z', summary: null }),
      ],
      title: 'IFAI デイリー',
      description: 'AI news',
      categoryName: (category) => `cat:${category}`,
      origin: 'https://ifai.example',
    })
    expect(xml).toContain('<rss')
    expect(xml).toContain('<language>ja</language>')
    expect(xml).toContain('<link>https://ifai.example/ja/news</link>')
    expect(xml).toContain('https://ifai.example/ja/news/story-1')
    expect(xml).toContain('<category>cat:tools</category>')
    expect(xml).toContain('Fri, 23 Oct 2026 01:00:00 GMT')
    // Markup in a summary is wrapped as character data, not parsed as part of the feed.
    expect(xml).toContain('<![CDATA[A <b>bold</b> claim & more')
  })
})
