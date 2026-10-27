'use client'

import { useLocale, useTranslations } from 'next-intl'
import { useState, type MouseEvent } from 'react'

import { Link } from '@/i18n/navigation'
import type { StoryTag } from '../../tags'

import type { StoryItem } from '../story-item'
import { listHref } from '../list-params'
import { DailyFeed } from './daily-feed'
import { pagePill, pageEnd } from './story-card'

type DailyPagesProps = {
  /** This page's stories, newest first. */
  stories: StoryItem[]
  page: number
  pages: number
  tag: StoryTag | null
  serverToday: string
}

/**
 * The list's stories and「加载更多」(站长, 2026-10-27): each page is two weeks of news
 * (../list-pages.ts). The button is a link to the next page, which search engines follow; a click
 * adds that page's stories under these instead and puts its address in the address bar. After the
 * last page it says there is nothing earlier. A later page links back to the newest stories.
 */
export function DailyPages({ stories: first, page, pages, tag, serverToday }: DailyPagesProps) {
  const t = useTranslations('daily')
  const locale = useLocale()
  const [stories, setStories] = useState(first)
  const [last, setLast] = useState(page)
  const [state, setState] = useState<'idle' | 'loading' | 'failed'>('idle')
  const next = last + 1

  const loadMore = async (event: MouseEvent<HTMLAnchorElement>) => {
    // A modified click opens the page in a new tab, as a link.
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return
    event.preventDefault()
    const href = event.currentTarget.href
    if (state === 'loading') return
    setState('loading')
    try {
      const query = new URLSearchParams({ locale, page: String(next), ...(tag ? { tag } : {}) })
      const response = await fetch(`/api/daily/list?${query}`)
      if (!response.ok) throw new Error(String(response.status))
      const body = (await response.json()) as { stories: StoryItem[] }
      const seen = new Set(stories.map((story) => story.id))
      setStories([...stories, ...body.stories.filter((story) => !seen.has(story.id))])
      setLast(next)
      setState('idle')
      window.history.replaceState(window.history.state, '', href)
    } catch {
      setState('failed')
    }
  }

  return (
    <>
      <DailyFeed stories={stories} serverToday={serverToday} />
      <nav aria-label={t('pages')} className="flex flex-wrap justify-center gap-3">
        {page > 1 && (
          <Link href={listHref({ tag })} className={pagePill}>
            {t('loadNewer')}
          </Link>
        )}
        {next <= pages ? (
          <Link
            href={listHref({ tag, page: next })}
            rel="next"
            prefetch={false}
            onClick={loadMore}
            aria-busy={state === 'loading'}
            className={`${pagePill} aria-busy:text-ink-4`}
          >
            {state === 'loading' ? t('loadingMore') : state === 'failed' ? t('loadMoreFailed') : t('loadMore')}
          </Link>
        ) : (
          <p className={pageEnd}>{t('noEarlier')}</p>
        )}
      </nav>
    </>
  )
}
