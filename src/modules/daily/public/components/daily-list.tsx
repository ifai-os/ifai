import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'

import { ButtonLink } from '@/components/button'
import { EmptyState } from '@/components/states/empty-state'
import type { Locale } from '@/i18n/config'
import { Link } from '@/i18n/navigation'
import { dayKey, serverTimeZone } from '@/lib/local-time'

import type { StoryCategory } from '../../categories'
import { hotStories, hottestStory, listStories, mentionedApps, sourceCount } from '../data'
import { listHref } from '../list-params'
import { CategoryNav } from './category-nav'
import { DailyFeed } from './daily-feed'
import { TodayBadge, UpdatedStat } from './hero-bits'
import { HotList } from './hot-list'
import { HottestCard } from './hottest-card'
import { MentionedApps } from './mentioned-apps'

type DailyListProps = {
  locale: Locale
  /** The category being shown; null for every story. */
  category: StoryCategory | null
  page: number
}

/**
 * The daily list (「IFAI 日报（新版）」and「手机 · 日报」boards): header with today's hottest story
 * (first page of every story only), categories, stories by day and earlier pages, and beside
 * them the apps in today's news and the hottest events of the last 48 hours.
 */
export async function DailyList({ locale, category, page }: DailyListProps) {
  const [t, names, result, sources, hottest, hot, apps] = await Promise.all([
    getTranslations('daily'),
    getTranslations('categories'),
    listStories({ locale, category, page }),
    sourceCount(),
    !category && page === 1 ? hottestStory(locale) : null,
    hotStories(locale),
    mentionedApps(),
  ])
  // Past the last page: answer 404 rather than an empty list under a new address.
  if (page > 1 && result.stories.length === 0) notFound()

  const serverToday = dayKey(new Date(), serverTimeZone)
  const latest = result.stories[0]?.publishedAt ?? null
  const pill =
    'inline-flex h-10 items-center rounded-pill border border-line bg-bg px-5 text-ui font-medium text-ink transition-colors hover:border-ink-4'

  return (
    <main id="main" className="mx-auto flex w-full max-w-content flex-col gap-5 px-4 pt-5 pb-16 md:gap-7 md:pt-8 md:pb-24">
      <div className="flex flex-col gap-4 md:flex-row">
        <header
          className={`flex items-start gap-4 rounded-hero border border-surface-2 bg-surface px-5 py-5 md:gap-6 md:px-8 md:py-7 ${
            hottest ? 'md:w-2/5 md:flex-none md:flex-col md:gap-5 lg:w-1/3' : 'md:flex-1 md:items-center'
          }`}
        >
          <TodayBadge serverToday={serverToday} />
          <div className="flex min-w-0 flex-col gap-1.5">
            <h1 className="text-h2 md:text-display">{category ? names(category) : t('title')}</h1>
            <p className="text-meta text-ink-3 md:text-body">{t('intro')}</p>
            <p className="flex flex-wrap gap-x-2 text-small text-ink-4 md:text-meta">
              <span>{t('sourceCount', { count: sources })}</span>
              {latest && (
                <>
                  <span aria-hidden="true">·</span>
                  <UpdatedStat iso={latest} />
                </>
              )}
            </p>
          </div>
        </header>
        {hottest && <HottestCard story={hottest} category={names(hottest.category)} />}
      </div>

      <CategoryNav current={category} />

      <div className="flex flex-col gap-12 lg:flex-row lg:items-start">
        <div className="flex min-w-0 flex-1 flex-col gap-5 md:gap-7">
          {result.stories.length > 0 ? (
            <DailyFeed stories={result.stories} serverToday={serverToday} />
          ) : category ? (
            <EmptyState title={t('emptyCategoryTitle')} body={t('emptyCategoryBody')}>
              <ButtonLink href="/daily" variant="secondary">
                {t('allStories')}
              </ButtonLink>
            </EmptyState>
          ) : (
            <EmptyState title={t('emptyTitle')} body={t('emptyBody')} />
          )}

          {(page > 1 || page < result.pages) && (
            <nav aria-label={t('pages')} className="flex flex-wrap justify-center gap-3 pt-2">
              {page > 1 && (
                <Link rel="prev" href={listHref({ category, page: page - 1 })} className={pill}>
                  {t('loadNewer')}
                </Link>
              )}
              {page < result.pages && (
                <Link rel="next" href={listHref({ category, page: page + 1 })} className={pill}>
                  {t('loadEarlier')}
                </Link>
              )}
            </nav>
          )}
        </div>

        {(hot.length > 0 || apps.length > 0) && (
          <aside className="flex flex-col gap-8 lg:w-side lg:flex-none">
            <MentionedApps apps={apps} serverToday={serverToday} />
            {hot.length > 0 && <HotList stories={hot} />}
          </aside>
        )}
      </div>
    </main>
  )
}
