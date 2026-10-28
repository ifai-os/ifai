'use client'

import { useLocale, useTranslations } from 'next-intl'
import { createContext, use, useEffect, useLayoutEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react'

import { buttonClass } from '@/components/button'
import { EmptyState } from '@/components/states/empty-state'
import { LoadFailed } from '@/components/states/load-failed'
import { loadTimeoutMs, skeletonDelayMs, type LoadingPhase } from '@/components/states/timing'
import { Link } from '@/i18n/navigation'

import type { StoryCategory } from '../../categories'
import type { StoryItem } from '../story-item'
import { DailyPages } from './daily-pages'
import { DailyFeedSkeleton } from './daily-skeletons'

/** What the list shows: one category's (or every) story, from a page on. */
type Listing = {
  category: StoryCategory | null
  stories: StoryItem[]
  page: number
  pages: number
}

type CategoryFilterValue = {
  listing: Listing
  /** The category the reader picked last, which the column marks while it loads. */
  picked: StoryCategory | null
  phase: LoadingPhase | null
  /** The stories' height when the reader clicked, kept under the skeleton so the page does not shrink meanwhile. */
  height: number | null
  select: (category: StoryCategory | null) => void
}

const CategoryFilterContext = createContext<CategoryFilterValue | null>(null)

/** The category the list is filtered to, while ./category-nav.tsx sits inside `CategoryFilter`. */
export function useCategoryFilter() {
  return use(CategoryFilterContext)
}

// The header (56) plus 24, as ../../../../components/sticky-column.tsx pins the columns.
const listTop = 80

/**
 * The daily list's left column filters the stories in place, as sspai.com's home does (站长,
 * 2026-10-28): the page does not scroll and the address does not change; only the stories swap.
 * The links still point at `/news?category=`, so a modified click, a search engine or a click
 * before the page has loaded opens that address. Each category is fetched once
 * (`/api/daily/list`); the old stories stay until the new ones are in, then a skeleton after
 * 300 ms and「加载失败」after 10 s (「空状态与加载状态」board). If the new stories end above the
 * window, the page moves up to their top rather than leaving the reader below them.
 */
export function CategoryFilter({ initial, children }: { initial: Listing; children: ReactNode }) {
  const locale = useLocale()
  const [listing, setListing] = useState(initial)
  const [picked, setPicked] = useState(initial.category)
  const [phase, setPhase] = useState<LoadingPhase | null>(null)
  const [height, setHeight] = useState<number | null>(null)
  const cache = useRef(new Map<string, Listing>(initial.page === 1 ? [[initial.category ?? '', initial]] : []))
  const request = useRef<AbortController | null>(null)
  // The window's position when the reader clicked, kept through the skeleton and the swap.
  const hold = useRef<number | null>(null)

  const select = (category: StoryCategory | null) => {
    request.current?.abort()
    request.current = null
    if (hold.current === null) hold.current = window.scrollY
    setPicked(category)
    setHeight(document.getElementById(dailyStoriesId)?.offsetHeight ?? null)
    // The address stays as it is, unless it names another category or page, which a reload would show.
    const url = new URL(window.location.href)
    if (url.searchParams.has('category') || url.searchParams.has('page')) {
      url.searchParams.delete('category')
      url.searchParams.delete('page')
      window.history.replaceState(window.history.state, '', url)
    }

    const cached = cache.current.get(category ?? '')
    if (cached) {
      setListing(cached)
      setPhase(null)
      return
    }

    const controller = new AbortController()
    request.current = controller
    setPhase((current) => (current === 'failed' ? 'skeleton' : (current ?? 'waiting')))
    const showSkeleton = setTimeout(() => setPhase((current) => (current === 'waiting' ? 'skeleton' : current)), skeletonDelayMs)
    const giveUp = setTimeout(() => {
      controller.abort()
      setPhase('failed')
    }, loadTimeoutMs)
    controller.signal.addEventListener('abort', () => {
      clearTimeout(showSkeleton)
      clearTimeout(giveUp)
    })

    const query = new URLSearchParams({
      locale,
      page: '1',
      ...(category ? { category } : {}),
    })
    fetch(`/api/daily/list?${query}`, { signal: controller.signal })
      .then(async (response) => {
        // No stories under this category yet: the API answers 404 for an empty page.
        if (response.status === 404) return { stories: [], pages: 0 }
        if (!response.ok) throw new Error(String(response.status))
        return (await response.json()) as {
          stories: StoryItem[]
          pages: number
        }
      })
      .then((body) => {
        if (controller.signal.aborted) return
        const next = {
          category,
          stories: body.stories,
          page: 1,
          pages: body.pages,
        }
        cache.current.set(category ?? '', next)
        clearTimeout(showSkeleton)
        clearTimeout(giveUp)
        request.current = null
        setListing(next)
        setPhase(null)
      })
      .catch(() => {
        if (controller.signal.aborted) return
        clearTimeout(showSkeleton)
        clearTimeout(giveUp)
        request.current = null
        setPhase('failed')
      })
  }

  useEffect(() => () => request.current?.abort(), [])

  // Before paint: put the window back where it was. When the new stories are shorter and end inside
  // the window with their top above it, move up only as far as it takes to show their top or fill
  // the window with them, so the reader is never left looking at the space under a short list.
  useLayoutEffect(() => {
    const y = hold.current
    if (y === null) return
    if (Math.abs(window.scrollY - y) > 1) window.scrollTo({ top: y, behavior: 'instant' })
    if (phase === 'waiting' || phase === 'skeleton') return
    hold.current = null
    const list = document.getElementById(dailyStoriesId)
    if (!list) return
    const box = list.getBoundingClientRect()
    if (box.top < listTop && box.bottom < window.innerHeight) {
      const up = Math.min(listTop - box.top, window.innerHeight - box.bottom)
      window.scrollTo({
        top: Math.max(0, window.scrollY - up),
        behavior: 'instant',
      })
    }
  }, [listing, phase])

  return <CategoryFilterContext value={{ listing, picked, phase, height, select }}>{children}</CategoryFilterContext>
}

/** A plain click picks the category in place; any other click opens the link's address. */
export function pickCategory(
  event: MouseEvent<HTMLAnchorElement>,
  filter: Pick<CategoryFilterValue, 'select'>,
  category: StoryCategory | null,
) {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return
  event.preventDefault()
  filter.select(category)
}

const dailyStoriesId = 'daily-stories'

/** The stories under the column: the current listing, its skeleton,「加载失败」, or the empty state. */
export function FilteredStories({ serverToday }: { serverToday: string }) {
  const t = useTranslations('daily')
  const filter = use(CategoryFilterContext)
  if (!filter) return null
  const { listing, phase } = filter
  const retry = () => filter.select(filter.picked)

  let content: ReactNode
  if (phase === 'failed') content = <LoadFailed onRetry={retry} />
  else if (phase === 'skeleton') content = <DailyFeedSkeleton count={Math.min(Math.max(listing.stories.length, 3), 6)} />
  else if (listing.stories.length > 0)
    content = (
      <DailyPages
        key={`${listing.category}-${listing.page}`}
        stories={listing.stories}
        page={listing.page}
        pages={listing.pages}
        tag={null}
        category={listing.category}
        serverToday={serverToday}
      />
    )
  else if (listing.category)
    content = (
      <EmptyState title={t('emptyCategoryTitle')} body={t('emptyCategoryBody')}>
        <Link href="/news" onClick={(event) => pickCategory(event, filter, null)} className={buttonClass('secondary')}>
          {t('allStories')}
        </Link>
      </EmptyState>
    )
  else content = <EmptyState title={t('emptyTitle')} body={t('emptyBody')} />

  return (
    <div
      id={dailyStoriesId}
      style={{
        minHeight: phase === 'skeleton' ? (filter.height ?? undefined) : undefined,
      }}
      className="flex flex-col gap-6"
    >
      {content}
    </div>
  )
}
