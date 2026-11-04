import { useTranslations } from 'next-intl'

import { buttonClass } from '@/components/button'
import { EmptyState } from '@/components/states/empty-state'
import { ListLink, ListResults } from '@/components/states/list-navigation'
import type { AuthProviders } from '@/lib/auth/providers'
import { FollowButton, FollowCount, FollowedNote } from '@/modules/follows/components/follow-button'
import { FollowProvider } from '@/modules/follows/components/follow-provider'
import type { FollowTarget } from '@/modules/follows/target'

import type { TagPage } from '../story-item'
import { listHref } from '../list-params'
import { StoryCardsSkeleton } from './daily-skeletons'
import { pageEnd, pagePill, StoryCard } from './story-card'

/**
 * An industry tag's page (docs/specs/daily.md「行业标签」), laid out as a company's or product's
 * topic page (站长, 2026-11-04; ./topic-page.tsx): the round tile (a #, since most tags start with「AI」), #name,「行业标签」, how many
 * stories and followers, and「+ 关注」, then the stories with the tag as cards under their days,
 * newest first, 20 to a page. Inside `ListNavigationProvider` (the route page), earlier pages load
 * in place; the follow state is read in the browser.
 */
export function TagPageView({ page, serverToday, signIn }: { page: TagPage; serverToday: string; signIn: AuthProviders }) {
  const t = useTranslations('daily')
  const names = useTranslations('categories')
  const tagNames = useTranslations('tags')
  const { tag } = page
  const name = tagNames(tag)
  const target: FollowTarget = { type: 'tag', key: tag }

  return (
    <main id="main" className="flex w-full flex-1 flex-col bg-surface">
      <FollowProvider targets={[target]} signIn={signIn}>
        <section aria-labelledby="tag-title" className="border-b border-line bg-bg">
          <div className="mx-auto w-full max-w-240 px-4 py-8">
            <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-5">
              <div className="flex min-w-0 items-center gap-4">
                <span
                  aria-hidden="true"
                  className="flex size-16 flex-none items-center justify-center rounded-pill border border-line bg-surface-2 text-h2 text-ink md:size-20 md:text-h1"
                >
                  #
                </span>
                <div className="flex min-w-0 flex-col gap-1.5">
                  <h1 id="tag-title" className="text-h2 font-medium wrap-anywhere md:text-h1 md:font-medium">
                    <span aria-hidden="true" className="text-accent-ink">
                      #
                    </span>
                    {name}
                  </h1>
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-meta text-ink-4">
                    <span>{t('entityKinds.tag')}</span>
                    <span aria-hidden="true">·</span>
                    <span>{t('topicCount', { count: page.total })}</span>
                    <FollowCount target={target} />
                  </p>
                </div>
              </div>
              <FollowButton target={target} name={name} look="page" />
            </div>
            <FollowedNote target={target} name={name} />
          </div>
        </section>
      </FollowProvider>

      <div className="mx-auto flex w-full max-w-240 flex-col gap-7 px-4 pt-8 pb-16 md:pb-30">
        {page.page > 1 && (
          <ListLink rel="prev" href={listHref({ tag, page: page.page - 1 })} className={`${pagePill} self-center`}>
            {t('loadNewer')}
          </ListLink>
        )}
        <ListResults skeleton={<StoryCardsSkeleton count={Math.min(Math.max(page.stories.length, 3), 6)} />}>
          {page.stories.length > 0 ? (
            <ol className="flex flex-col gap-7">
              {page.stories.map((story, index) => (
                <StoryCard
                  key={story.id}
                  story={story}
                  serverToday={serverToday}
                  category={names(story.category)}
                  previousIso={page.stories[index - 1]?.publishedAt}
                />
              ))}
            </ol>
          ) : (
            <EmptyState title={t('emptyTagTitle')} body={t('emptyTagBody')}>
              <ListLink href={listHref()} className={buttonClass('secondary')}>
                {t('allStories')}
              </ListLink>
            </EmptyState>
          )}
        </ListResults>
        {page.stories.length > 0 && (
          <nav aria-label={t('pages')} className="flex justify-center pt-1">
            {page.page < page.pages ? (
              <ListLink rel="next" href={listHref({ tag, page: page.page + 1 })} className={pagePill}>
                {t('topicEarlier', { count: page.earlier })}
              </ListLink>
            ) : (
              <p className={pageEnd}>{t('noEarlier')}</p>
            )}
          </nav>
        )}
      </div>
    </main>
  )
}
