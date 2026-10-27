import { NextIntlClientProvider } from 'next-intl'
import type { ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import type { StoryItem } from '@/modules/daily/public/story-item'
import { followingHref, FollowingPageView } from '@/modules/follows/components/following-page'
import type { FollowingPage } from '@/modules/follows/following'

import en from '../../messages/en.json'

// The ×'s refresh needs the app router, which a static render has not got.
vi.mock('@/i18n/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/i18n/navigation')>()),
  useRouter: () => ({ refresh: () => {} }),
}))

const render = (element: ReactElement) =>
  renderToStaticMarkup(
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      {element}
    </NextIntlClientProvider>,
  )

const signIn = { google: false, github: false, email: true }

const story = (id: number, publishedAt: string): StoryItem => ({
  id,
  slug: `story-${id}`,
  category: 'tools',
  publishedAt,
  correctedAt: null,
  title: { value: `Story ${id}`, lang: 'en' },
  summary: null,
  tryIt: null,
  moreReports: 0,
  spread: 0,
  originalName: null,
  media: null,
})

describe('「我的关注」', () => {
  it('asks a visitor to sign in', () => {
    const html = render(<FollowingPageView following={null} signIn={signIn} serverToday="2026-10-24" />)
    expect(html).toContain(`>${en.follows.title}</h1>`)
    expect(html).toContain(en.follows.signInBody)
  })

  it('leads a member who follows nothing to the Daily', () => {
    const empty: FollowingPage = { tags: [], topics: [], stories: { stories: [], total: 0, page: 1, pages: 0 } }
    const html = render(<FollowingPageView following={empty} signIn={signIn} serverToday="2026-10-24" />)
    expect(html).toContain(en.follows.emptyTitle)
    expect(html).toContain('href="/en/daily"')
  })

  it('lists what the member follows, each with an ×, then its news a page at a time', () => {
    const following: FollowingPage = {
      tags: ['vibe-coding'],
      topics: [
        { key: 'kimi', name: 'Kimi', kind: 'product' },
        { key: 'gone', name: 'gone', kind: null },
      ],
      stories: { stories: [story(1, '2026-10-24T09:00:00Z'), story(2, '2026-10-23T09:00:00Z')], total: 31, page: 1, pages: 2 },
    }
    const html = render(<FollowingPageView following={following} signIn={signIn} serverToday="2026-10-24" />)
    expect(html).toContain(`${en.follows.followed} <span class="font-normal text-ink-4">3</span>`)
    expect(html).toContain(`href="/en/daily/tag/vibe-coding"`)
    expect(html).toContain(`>${en.tags['vibe-coding']}</a>`)
    expect(html).toContain('href="/en/daily/topic/kimi"')
    expect(html).toContain('aria-label="Unfollow Kimi"')
    expect(html).toContain(`aria-label="Unfollow ${en.tags['vibe-coding']}"`)
    expect(html).toContain('href="/en/daily/story-1"')
    expect(html).toContain('href="/en/daily/story-2"')
    expect(html).toContain(`href="/en${followingHref(2)}"`)
    expect(html).not.toContain(en.daily.loadNewer)
  })

  it('says when what the member follows has no news yet', () => {
    const quiet: FollowingPage = { tags: ['music'], topics: [], stories: { stories: [], total: 0, page: 1, pages: 0 } }
    const html = render(<FollowingPageView following={quiet} signIn={signIn} serverToday="2026-10-24" />)
    expect(html).toContain(en.follows.noStoriesTitle)
    expect(html).not.toContain(en.daily.loadEarlier)
  })
})
