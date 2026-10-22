import { describe, expect, it } from 'vitest'

import { extractArticle } from '@/modules/daily/extract'
import { readFeed } from '@/modules/daily/readers/feed'
import { readHackerNews } from '@/modules/daily/readers/hacker-news'
import { readHtmlList } from '@/modules/daily/readers/html-list'

const rss = `<?xml version="1.0"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
<channel><title>TechCrunch AI</title><link>https://techcrunch.com/</link><description>AI</description>
<item>
  <title>OpenAI &amp; friends ship &#8220;Duet&#8221;</title>
  <link>https://techcrunch.com/2026/10/22/openai-duet/?utm_source=rss&amp;utm_medium=feed</link>
  <guid isPermaLink="false">tc-1</guid>
  <pubDate>Thu, 22 Oct 2026 09:30:00 +0000</pubDate>
  <description><![CDATA[<p>A <b>new</b> model&nbsp;arrives.</p>]]></description>
  <content:encoded><![CDATA[<p>Full story with <a href="/x">links</a>.</p>]]></content:encoded>
</item>
<item>
  <title>Duplicate link</title>
  <link>https://techcrunch.com/2026/10/22/openai-duet/</link>
</item>
<item>
  <title>No link at all</title>
  <description>skip</description>
</item>
</channel></rss>`

const atom = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>DeepMind blog</title><id>urn:feed</id><updated>2026-10-22T00:00:00Z</updated>
  <entry>
    <title>WeatherNext 3</title>
    <id>urn:post:1</id>
    <link rel="self" href="https://deepmind.google/feed/1"/>
    <link rel="alternate" href="https://deepmind.google/blog/weathernext-3/"/>
    <published>2026-10-21T15:00:00Z</published>
    <updated>2026-10-22T08:00:00Z</updated>
    <summary type="html">&lt;p&gt;15-day forecasts in a minute.&lt;/p&gt;</summary>
  </entry>
</feed>`

const jsonFeed = JSON.stringify({
  version: 'https://jsonfeed.org/version/1.1',
  title: 'Example',
  items: [
    {
      id: 'j1',
      url: 'https://example.com/posts/1',
      title: 'JSON post',
      content_text: 'Plain text body',
      date_published: '2026-10-22T01:02:03Z',
    },
  ],
})

describe('readFeed', () => {
  it('reads RSS items, cleans text and keeps each link once', () => {
    const items = readFeed(rss)
    expect(items).toHaveLength(1)
    expect(items[0]).toEqual({
      url: 'https://techcrunch.com/2026/10/22/openai-duet',
      title: 'OpenAI & friends ship “Duet”',
      summary: 'Full story with links.',
      publishedAt: new Date('2026-10-22T09:30:00Z'),
      externalId: 'tc-1',
    })
  })

  it('reads Atom entries using the alternate link and published date', () => {
    const items = readFeed(atom)
    expect(items).toEqual([
      {
        url: 'https://deepmind.google/blog/weathernext-3',
        title: 'WeatherNext 3',
        summary: '15-day forecasts in a minute.',
        publishedAt: new Date('2026-10-21T15:00:00Z'),
        externalId: 'urn:post:1',
      },
    ])
  })

  it('reads JSON Feed items', () => {
    expect(readFeed(jsonFeed)).toEqual([
      {
        url: 'https://example.com/posts/1',
        title: 'JSON post',
        summary: 'Plain text body',
        publishedAt: new Date('2026-10-22T01:02:03Z'),
        externalId: 'j1',
      },
    ])
  })

  it('throws on something that is not a feed', () => {
    expect(() => readFeed('<html><body>nope</body></html>')).toThrow()
  })
})

describe('readHtmlList', () => {
  const flat = `<main>
    <article class="post"><h2><a href="/articles/one/">  One  </a></h2><p class="dek">Summary one</p><time datetime="2026-10-22T10:00:00Z">Oct 22</time></article>
    <article class="post"><h2><a href="https://www.therundown.ai/articles/two?utm_source=x">Two</a></h2></article>
    <article class="post"><h2><a href="/articles/one/">One again</a></h2></article>
    <article class="post"><h2>No link</h2></article>
  </main>`

  it('reads a flat list with the entry date', () => {
    const items = readHtmlList(flat, 'https://www.therundown.ai/articles', {
      item: 'article.post',
      link: 'h2 a',
      summary: '.dek',
      date: 'time',
    })
    expect(items).toEqual([
      {
        url: 'https://www.therundown.ai/articles/one',
        title: 'One',
        summary: 'Summary one',
        publishedAt: new Date('2026-10-22T10:00:00Z'),
      },
      { url: 'https://www.therundown.ai/articles/two', title: 'Two' },
    ])
  })

  const grouped = `<div>
    <section class="day"><h3 class="date">October 22, 2026</h3>
      <div class="entry"><a href="https://techcrunch.com/story-a/?utm_source=futuretools">Story A</a></div>
      <div class="entry"><a href="https://www.futuretools.io/news/story-a">Read on Future Tools</a></div>
    </section>
    <section class="day"><h3 class="date">October 21, 2026</h3>
      <div class="entry"><a href="https://theverge.com/story-b">Story B</a></div>
    </section>
  </div>`

  it('reads a list grouped by day and skips the site’s own pages', () => {
    const items = readHtmlList(grouped, 'https://www.futuretools.io/news', {
      item: '.entry',
      group: 'section.day',
      groupDate: '.date',
      skipHosts: ['futuretools.io'],
    })
    expect(items.map((item) => [item.url, item.publishedAt?.toISOString().slice(0, 10)])).toEqual([
      ['https://techcrunch.com/story-a', '2026-10-22'],
      ['https://theverge.com/story-b', '2026-10-21'],
    ])
  })
})

describe('readHackerNews', () => {
  const page = {
    hits: [
      { objectID: '1', title: 'Big model release', url: 'https://example.com/a?utm_source=hn', points: 320, num_comments: 150, created_at: '2026-10-22T03:00:00Z' },
      { objectID: '2', title: 'Ask HN: anything?', url: null, points: 500, num_comments: 10, created_at: '2026-10-22T03:00:00Z' },
      { objectID: '3', title: 'Quiet post', url: 'https://example.com/b', points: 12, num_comments: 1, created_at: '2026-10-22T03:00:00Z' },
    ],
  }

  it('keeps linked stories above the score threshold, with the thread as discussion', () => {
    expect(readHackerNews(page)).toEqual([
      {
        url: 'https://example.com/a',
        title: 'Big model release',
        externalId: '1',
        discussionUrl: 'https://news.ycombinator.com/item?id=1',
        signals: { points: 320, comments: 150 },
        publishedAt: new Date('2026-10-22T03:00:00Z'),
      },
    ])
    expect(readHackerNews(page, { minPoints: 10 })).toHaveLength(2)
  })

  it('rejects a response that is not the Algolia shape', () => {
    expect(() => readHackerNews({ nope: true })).toThrow()
  })
})

describe('extractArticle', () => {
  const paragraph = (n: number) =>
    `<p>Paragraph ${n}: the company announced a new model today, saying it runs on consumer hardware and ships with open weights, a permissive licence and a long technical report describing the training data.</p>`
  const page = `<html lang="en"><head><title>New model arrives | Example News</title>
    <meta property="article:published_time" content="2026-10-22T07:45:00Z">
    <meta property="og:site_name" content="Example News">
    <meta name="author" content="Jane Doe"></head>
    <body><nav><a href="/">Home</a> <a href="/ai">AI</a></nav>
    <article><h1>New model arrives</h1>${paragraph(1)}${paragraph(2)}${paragraph(3)}${paragraph(4)}</article>
    <footer><a href="/about">About</a></footer></body></html>`

  it('returns the readable text with the published time and site', () => {
    const article = extractArticle(page, 'https://news.example.com/new-model')
    expect(article).not.toBeNull()
    expect(article?.title).toBe('New model arrives')
    expect(article?.text).toContain('Paragraph 1: the company announced')
    expect(article?.text).toContain('Paragraph 4')
    expect(article?.text).not.toContain('Home')
    expect(article?.publishedAt).toEqual(new Date('2026-10-22T07:45:00Z'))
    expect(article?.siteName).toBe('Example News')
  })

  it('falls back to JSON-LD for the date', () => {
    const withLd = page
      .replace(/<meta property="article:published_time"[^>]*>/, '')
      .replace('</head>', '<script type="application/ld+json">{"@type":"NewsArticle","datePublished":"2026-10-20T00:00:00Z"}</script></head>')
    expect(extractArticle(withLd, 'https://news.example.com/new-model')?.publishedAt).toEqual(
      new Date('2026-10-20T00:00:00Z'),
    )
  })

  it('keeps the outbound links of the body, each once', () => {
    const withLinks = page.replace(
      paragraph(2),
      `<p>See <a href="https://openai.com/blog/x?utm_source=nl">OpenAI</a>, <a href="https://openai.com/blog/x">again</a>, <a href="/related">ours</a> and <a href="mailto:a@b.c">mail</a>.</p>`,
    )
    expect(extractArticle(withLinks, 'https://news.example.com/new-model')?.links).toEqual(['https://openai.com/blog/x'])
  })

  it('returns null for a page without an article body', () => {
    expect(extractArticle('<html><body><ul><li><a href="/a">A</a></li></ul></body></html>', 'https://example.com')).toBeNull()
  })
})
