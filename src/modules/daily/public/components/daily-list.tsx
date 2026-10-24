import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'

import { buttonClass } from '@/components/button'
import { EmptyState } from '@/components/states/empty-state'
import { ListLink, ListNavigationProvider, ListResults } from '@/components/states/list-navigation'
import type { Locale } from '@/i18n/config'
import { authProviders } from '@/lib/auth/providers'
import { dayKey, serverTimeZone } from '@/lib/local-time'
import { FollowButton } from '@/modules/follows/components/follow-button'
import { FollowProvider } from '@/modules/follows/components/follow-provider'

import type { StoryCategory } from '../../categories'
import type { StoryTag } from '../../tags'
import { SubscribeBox } from '../../email/components/subscribe-box'
import { subscribingOpen } from '../../email/delivery'
import { hotStories, hottestStory, latestPoster, listStories, mentionedApps } from '../data'
import { listHref } from '../list-params'
import { CategoryNav } from './category-nav'
import { DailyFeed } from './daily-feed'
import { DailyFeedSkeleton } from './daily-skeletons'
import { HotList } from './hot-list'
import { HottestCard } from './hottest-card'
import { MentionedApps } from './mentioned-apps'
import { PosterCard } from './poster-card'

type DailyListProps = {
  locale: Locale
  /** The category being shown; null for every story. */
  category: StoryCategory | null
  /** The industry tag being shown (`/daily/tag/<tag>`), if any. */
  tag?: StoryTag | null
  page: number
}

/**
 * The daily list (「IFAI 日报（新版）」and「手机 · 日报」boards): today's hottest story and the
 * latest「每日 AI 大事」poster (first page of every story only), categories, stories by
 * day and earlier pages, and beside them the apps in today's news and the hottest events of the
 * last 48 hours. The email subscribe box sits under the poster on wide screens (in the poster's
 * place when there is none) and after the stories on phones and tablets.
 */
export async function DailyList({ locale, category, tag = null, page }: DailyListProps) {
  const front = !category && !tag && page === 1
  const [t, names, tagNames, result, hottest, poster, hot, apps] = await Promise.all([
    getTranslations('daily'),
    getTranslations('categories'),
    getTranslations('tags'),
    listStories({ locale, category, tag, page }),
    front ? hottestStory(locale) : null,
    front ? latestPoster() : null,
    hotStories(locale),
    mentionedApps(),
  ])
  // Past the last page: answer 404 rather than an empty list under a new address.
  if (page > 1 && result.stories.length === 0) notFound()

  const subscribe = subscribingOpen()
  const serverToday = dayKey(new Date(), serverTimeZone)
  const pill =
    'inline-flex h-10 items-center rounded-pill border border-line bg-bg px-5 text-ui font-medium text-ink transition-colors hover:border-ink-4'

  return (
    <ListNavigationProvider>
      <main id="main" className="mx-auto flex w-full max-w-content flex-col gap-5 px-4 pt-5 pb-16 md:gap-7 md:pt-8 md:pb-24">
        {tag ? (
          // No board has the tag page; its「+ 关注」is the topic page's (docs/specs/daily.md「关注」).
          <FollowProvider targets={[{ type: 'tag', key: tag }]} signIn={authProviders()}>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
              <h1 className="text-h1">{t('tagTitle', { tag: tagNames(tag) })}</h1>
              <FollowButton target={{ type: 'tag', key: tag }} name={tagNames(tag)} look="page" />
            </div>
          </FollowProvider>
        ) : (
          <h1 className="sr-only">{category ? names(category) : t('title')}</h1>
        )}
        {/* The board's row: hottest story and poster share it 2 : 1 and wrap when there is no room. */}
        <div className="flex flex-col gap-4 empty:hidden md:flex-row md:flex-wrap">
          {hottest && <HottestCard story={hottest} category={names(hottest.category)} />}
          {poster ? (
            <div className={`flex flex-col gap-4 ${hottest ? 'md:grow md:basis-54' : 'md:w-side md:flex-none'}`}>
              <PosterCard poster={poster} locale={locale} />
              {subscribe && (
                <div className="hidden lg:block">
                  <SubscribeBox variant="column" />
                </div>
              )}
            </div>
          ) : (
            subscribe && (
              <div className="hidden lg:block lg:w-side lg:flex-none">
                <SubscribeBox variant="column" />
              </div>
            )
          )}
        </div>

        {!tag && <CategoryNav current={category} />}

        <div className="flex flex-col gap-12 lg:flex-row lg:items-start">
          <div className="flex min-w-0 flex-1 flex-col gap-5 md:gap-7">
            <ListResults skeleton={<DailyFeedSkeleton count={Math.min(Math.max(result.stories.length, 3), 6)} />}>
              {result.stories.length > 0 ? (
                <DailyFeed stories={result.stories} serverToday={serverToday} />
              ) : category || tag ? (
                <EmptyState title={t('emptyCategoryTitle')} body={t('emptyCategoryBody')}>
                  <ListLink href="/daily" className={buttonClass('secondary')}>
                    {t('allStories')}
                  </ListLink>
                </EmptyState>
              ) : (
                <EmptyState title={t('emptyTitle')} body={t('emptyBody')} />
              )}
            </ListResults>

            {(page > 1 || page < result.pages) && (
              <nav aria-label={t('pages')} className="flex flex-wrap justify-center gap-3 pt-2">
                {page > 1 && (
                  <ListLink rel="prev" href={listHref({ category, tag, page: page - 1 })} className={pill}>
                    {t('loadNewer')}
                  </ListLink>
                )}
                {page < result.pages && (
                  <ListLink rel="next" href={listHref({ category, tag, page: page + 1 })} className={pill}>
                    {t('loadEarlier')}
                  </ListLink>
                )}
              </nav>
            )}

            {subscribe && (
              <div className="lg:hidden">
                <SubscribeBox variant="card" />
              </div>
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
    </ListNavigationProvider>
  )
}
