import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'

import { buttonClass } from '@/components/button'
import { EmptyState } from '@/components/states/empty-state'
import { StickyColumn } from '@/components/sticky-column'
import { ListLink, ListNavigationProvider, ListResults } from '@/components/states/list-navigation'
import type { Locale } from '@/i18n/config'
import { authProviders } from '@/lib/auth/providers'
import { dayKey, serverTimeZone } from '@/lib/local-time'
import { FollowButton } from '@/modules/follows/components/follow-button'
import { FollowProvider } from '@/modules/follows/components/follow-provider'

import type { StoryTag } from '../../tags'
import { SubscribeBox } from '../../email/components/subscribe-box'
import { subscribingOpen } from '../../email/delivery'
import { hotStories, hottestStory, latestPoster, listStories, mentionedApps } from '../data'
import { CategoryNav } from './category-nav'
import { DailyPages } from './daily-pages'
import { DailyFeedSkeleton } from './daily-skeletons'
import { HotList } from './hot-list'
import { HottestCard } from './hottest-card'
import { MentionedApps } from './mentioned-apps'
import { PosterCard } from './poster-card'

type DailyListProps = {
  locale: Locale
  /** The industry tag being shown (`/daily/tag/<tag>`), if any; null for every story. */
  tag?: StoryTag | null
  page: number
}

/**
 * The daily list (「IFAI 日报（新版）」and「手机 · 日报」boards): 「头条」and the latest「每日 AI 大事」
 * poster (first page of every story only), then under a line the categories (each has its own page,
 * ./category-page.tsx), stories by day, two weeks at a time with「加载更多」(./daily-pages.tsx), and the apps in today's news and the
 * hottest events of the last 48 hours. The email subscribe box sits under the poster on wide
 * screens (in the poster's place when there is none) and after the stories on phones and tablets.
 * A tag's page is the same list without the first row and the categories.
 */
export async function DailyList({ locale, tag = null, page }: DailyListProps) {
  const front = !tag && page === 1
  const [t, names, tagNames, result, hottest, poster, hot, apps] = await Promise.all([
    getTranslations('daily'),
    getTranslations('categories'),
    getTranslations('tags'),
    listStories({ locale, tag, page }),
    front ? hottestStory(locale) : null,
    front ? latestPoster() : null,
    hotStories(locale),
    mentionedApps(),
  ])
  // Past the last page: answer 404 rather than an empty list under a new address.
  if (page > 1 && result.stories.length === 0) notFound()

  const subscribe = subscribingOpen()
  const serverToday = dayKey(new Date(), serverTimeZone)
  const firstRow = Boolean(hottest || poster)

  return (
    <ListNavigationProvider>
      <main id="main" className="mx-auto flex w-full max-w-248 flex-col gap-5 px-4 pt-5 pb-16 md:gap-10 md:pt-8 md:pb-24">
        {tag ? (
          // No board has the tag page; its「+ 关注」is the topic page's (docs/specs/daily.md「关注」).
          <FollowProvider targets={[{ type: 'tag', key: tag }]} signIn={authProviders()}>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
              <h1 className="text-h1">{t('tagTitle', { tag: tagNames(tag) })}</h1>
              <FollowButton target={{ type: 'tag', key: tag }} name={tagNames(tag)} look="page" />
            </div>
          </FollowProvider>
        ) : (
          <h1 className="sr-only">{t('title')}</h1>
        )}
        {/* The board's first row: 「头条」and the poster share it 2 : 1 and wrap when there is no room.
            Without them only the subscribe box is left, which wide screens show here. */}
        {(firstRow || subscribe) && (
          <div className={`flex-col gap-3 md:flex-row md:flex-wrap ${firstRow ? 'flex' : 'hidden lg:flex'}`}>
            {hottest && <HottestCard story={hottest} category={names(hottest.category)} />}
            {poster ? (
              <div className={`flex flex-col gap-3 ${hottest ? 'md:grow md:basis-54' : 'md:w-side md:flex-none'}`}>
                <PosterCard poster={poster} locale={locale} />
                {subscribe && (
                  <div className="hidden lg:flex lg:grow lg:flex-col">
                    <SubscribeBox variant="column" />
                  </div>
                )}
              </div>
            ) : (
              subscribe && (
                <div className={`hidden lg:flex lg:flex-col ${hottest ? 'lg:grow lg:basis-54' : 'lg:w-side lg:flex-none'}`}>
                  <SubscribeBox variant="column" />
                </div>
              )
            )}
          </div>
        )}

        {/* The board's second part, under a line: the categories, the stories and the column beside them.
            Widths as sspai.com's home (站长, 2026-10-27): 960 in all, 164 · 520 · 164, 56 apart; what
            doesn't fit wraps under. Phones stack them, the
            categories as chips. Where all three share a row (lg), the two side columns stay put while
            the stories scroll (站长, 2026-10-27, after sspai.com). */}
        <div
          // The header's line comes in when this one reaches it (./header-line.tsx).
          data-header-line={firstRow || subscribe ? '' : undefined}
          className={`flex flex-col gap-5 md:flex-row md:flex-wrap md:items-start md:gap-x-14 md:gap-y-10 ${
            firstRow ? 'md:border-t md:border-line md:pt-6' : subscribe ? 'lg:border-t lg:border-line lg:pt-6' : ''
          }`}
        >
          {!tag && (
            <StickyColumn className="md:shrink-0 md:basis-41 lg:sticky">
              <CategoryNav current={null} />
            </StickyColumn>
          )}

          <div className="flex min-w-0 flex-col gap-6 md:grow-999 md:basis-105">
            <ListResults skeleton={<DailyFeedSkeleton count={Math.min(Math.max(result.stories.length, 3), 6)} />}>
              {result.stories.length > 0 ? (
                <DailyPages
                  key={`${tag}-${page}`}
                  stories={result.stories}
                  page={page}
                  pages={result.pages}
                  tag={tag}
                  serverToday={serverToday}
                />
              ) : tag ? (
                <EmptyState title={t('emptyCategoryTitle')} body={t('emptyCategoryBody')}>
                  <ListLink href="/daily" className={buttonClass('secondary')}>
                    {t('allStories')}
                  </ListLink>
                </EmptyState>
              ) : (
                <EmptyState title={t('emptyTitle')} body={t('emptyBody')} />
              )}
            </ListResults>

            {subscribe && (
              <div className="lg:hidden">
                <SubscribeBox variant="card" />
              </div>
            )}
          </div>

          {(hot.length > 0 || apps.length > 0) && (
            <StickyColumn className="max-md:mt-7 min-w-0 md:grow md:basis-41 lg:sticky lg:grow-0">
              <aside className="flex flex-col gap-8">
                <MentionedApps apps={apps} serverToday={serverToday} />
                {hot.length > 0 && <HotList stories={hot} />}
              </aside>
            </StickyColumn>
          )}
        </div>
      </main>
    </ListNavigationProvider>
  )
}
