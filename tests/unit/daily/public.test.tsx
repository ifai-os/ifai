import { NextIntlClientProvider } from 'next-intl'
import type { ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { inAnyLanguage } from '@/lib/i18n/localized'
import { dateOfKey, dayKey, groupByDay, readerTimeZone, relativeDay } from '@/lib/local-time'
import { DailyFeed } from '@/modules/daily/public/components/daily-feed'
import { HotList } from '@/modules/daily/public/components/hot-list'
import { HottestCard } from '@/modules/daily/public/components/hottest-card'
import { MentionedApps } from '@/modules/daily/public/components/mentioned-apps'
import { StoryDetailView } from '@/modules/daily/public/components/story-detail'
import { TodayHeadlines } from '@/modules/daily/public/components/today-headlines'
import { listHref, readPage, storyHref } from '@/modules/daily/public/list-params'
import { renderFeed } from '@/modules/daily/public/rss'
import { onePerEvent, toHot, toItem, type HotStory, type RawStory, type StoryDetail, type StoryItem } from '@/modules/daily/public/story-item'

import en from '../../../messages/en.json'

const render = (element: ReactElement) =>
  renderToStaticMarkup(
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      {element}
    </NextIntlClientProvider>,
  )

const story = (overrides: Partial<StoryItem> & Pick<StoryItem, 'id' | 'publishedAt'>): StoryItem => ({
  slug: `story-${overrides.id}`,
  category: 'product',
  correctedAt: null,
  title: { value: `Story ${overrides.id}`, lang: 'en' },
  summary: { value: 'What happened, in one line.', lang: 'en' },
  tryIt: null,
  moreReports: 0,
  originalName: 'Maker',
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
    expect(listHref()).toBe('/daily')
    expect(listHref({ category: 'open' })).toBe('/daily/category/open')
    expect(listHref({ category: 'open', page: 2 })).toBe('/daily/category/open?page=2')
    expect(listHref({ page: 1 })).toBe('/daily')
    expect(storyHref('a-story')).toBe('/daily/a-story')
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

  it('counts the outlets of a hot story without the discussion threads', () => {
    const hot = toHot({ ...raw, heat: 71.3, heatTrend: 'rising' } as RawStory, 'en')
    expect(hot).toMatchObject({ eventId: 1, heat: 71.3, trend: 'rising', outlets: 3 })
    expect(toHot({ ...raw, sources: [] } as RawStory, 'en')).toMatchObject({ heat: 0, trend: null, outlets: 1 })
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
          story({ id: 1, publishedAt: '2026-10-22T23:30:00Z', moreReports: 2, tryIt: { value: 'Open the app.', lang: 'en' } }),
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
    expect(html).toContain('2 more outlets reported this')
    expect(html).toContain(`${en.daily.tryIt}</span> Open the app.`)
    expect(html).toContain('lang="zh-Hans"')
    expect(html).toContain('href="/en/daily/story-2"')
  })
})

describe('the hottest events', () => {
  const hot = (overrides: Partial<HotStory> & Pick<HotStory, 'id' | 'eventId'>): HotStory => ({
    ...story({ id: overrides.id, publishedAt: '2026-10-22T09:00:00Z' }),
    heat: 50,
    trend: null,
    outlets: 1,
    ...overrides,
  })

  it('keeps the first story of each event', () => {
    const stories = [hot({ id: 1, eventId: 7 }), hot({ id: 2, eventId: 7 }), hot({ id: 3, eventId: 8 }), hot({ id: 4, eventId: 9 })]
    expect(onePerEvent(stories, 2).map((item) => item.id)).toEqual([1, 3])
  })

  it('ranks them with the outlets and the rising and new marks', () => {
    const html = render(
      <HotList
        stories={[
          hot({ id: 1, eventId: 1, outlets: 7, trend: 'rising' }),
          hot({ id: 2, eventId: 2, outlets: 1, trend: 'new' }),
          hot({ id: 3, eventId: 3, outlets: 4 }),
          hot({ id: 4, eventId: 4, outlets: 2 }),
        ]}
      />,
    )
    expect(html).toContain(`>${en.daily.hotTitle}</h2>`)
    expect(html).toContain('7 outlets')
    expect(html).toContain('1 outlet<')
    expect(html).toContain(`>${en.daily.trend.rising}</span>`)
    expect(html).toContain(`>${en.daily.trend.new}</span>`)
    expect(html).toContain('href="/en/daily/story-3"')
    // The first three ranks stand out.
    expect(html.match(/tabular-nums text-accent/g)).toHaveLength(3)
  })

  it("leads with today's hottest story, the whole card a link to it", () => {
    const html = render(<HottestCard story={hot({ id: 5, eventId: 5, moreReports: 6 })} category="Product" />)
    expect(html).toContain(`${en.daily.hottest} · Product · 6 more outlets reported this`)
    expect(html).toContain('href="/en/daily/story-5"')
    expect(html).toContain('What happened, in one line.')
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
    ...story({ id: 1, publishedAt: '2026-10-22T09:42:00Z', correctedAt: '2026-10-22T12:00:00Z', moreReports: 1 }),
    sources: [
      { name: 'Maker', role: 'original', url: 'https://www.maker.example/post', publishedAt: '2026-10-22T08:00:00Z' },
      { name: 'Outlet', role: 'report', url: 'https://outlet.example/x', publishedAt: null },
    ],
    developments: [story({ id: 9, publishedAt: '2026-10-20T09:00:00Z', slug: 'earlier' })],
  }

  it('lists the sources in order with their role, and the other developments', () => {
    const html = render(<StoryDetailView story={detail} />)
    expect(html.indexOf('Maker')).toBeLessThan(html.indexOf('Outlet'))
    expect(html).toContain('href="https://www.maker.example/post" target="_blank" rel="noopener"')
    expect(html).toContain(`>${en.daily.roles.original}<`)
    expect(html).toContain('maker.example')
    expect(html).toContain(`>${en.daily.corrected} <time dateTime="2026-10-22T12:00:00Z">`)
    expect(html).toContain('href="/en/daily/earlier"')
    expect(html).toContain('1 more outlet reported this')
  })
})

describe('the RSS feed', () => {
  it('links every story to its page in the feed’s language and escapes the text', () => {
    const xml = renderFeed({
      locale: 'ja',
      stories: [
        story({ id: 1, publishedAt: '2026-10-22T09:42:00Z', summary: { value: 'A <b>bold</b> claim & more', lang: 'en' }, tryIt: { value: 'Try now', lang: 'ja' } }),
        story({ id: 2, publishedAt: '2026-10-21T09:00:00Z', correctedAt: '2026-10-23T01:00:00Z', summary: null }),
      ],
      title: 'IFAI デイリー',
      description: 'AI news',
      tryItLabel: '試してみる',
      categoryName: (category) => `cat:${category}`,
      origin: 'https://ifai.example',
    })
    expect(xml).toContain('<rss')
    expect(xml).toContain('<language>ja</language>')
    expect(xml).toContain('<link>https://ifai.example/ja/daily</link>')
    expect(xml).toContain('https://ifai.example/ja/daily/story-1')
    expect(xml).toContain('<category>cat:product</category>')
    expect(xml).toContain('Fri, 23 Oct 2026 01:00:00 GMT')
    expect(xml).toContain('試してみる: Try now')
    // Markup in a summary is wrapped as character data, not parsed as part of the feed.
    expect(xml).toContain('<![CDATA[A <b>bold</b> claim & more')
  })
})
