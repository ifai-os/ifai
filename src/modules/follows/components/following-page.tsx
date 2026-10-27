import { useLocale, useTranslations } from 'next-intl'
import { Suspense, type ReactNode } from 'react'

import { SignInForm } from '@/components/auth/sign-in-form'
import { ButtonLink } from '@/components/button'
import { EmptyState } from '@/components/states/empty-state'
import { ListLink, ListResults } from '@/components/states/list-navigation'
import { localizePath, type Locale } from '@/i18n/config'
import { Link } from '@/i18n/navigation'
import type { AuthProviders } from '@/lib/auth/providers'
import { DailyFeed } from '@/modules/daily/public/components/daily-feed'
import { DailyFeedSkeleton } from '@/modules/daily/public/components/daily-skeletons'
import { listHref, topicHref } from '@/modules/daily/public/list-params'

import type { FollowingPage } from '../following'
import type { FollowTarget } from '../target'
import { RemoveFollow } from './remove-follow'

export const followingPath = '/me/following'

export function followingHref(page = 1): `/${string}` {
  return page > 1 ? `${followingPath}?page=${page}` : followingPath
}

type FollowingPageViewProps = {
  /** What the member follows and its news; null for a visitor, who gets the sign-in form. */
  following: FollowingPage | null
  signIn: AuthProviders
  /** Today's date on the server (UTC), for the news grouped by day. */
  serverToday: string
}

/**
 * 「我的关注」(docs/specs/daily.md「关注」): the industry tags, companies and products the member
 * follows, each with an ×, then their news grouped by day like the daily list, 30 to a page.
 * Earlier pages load in place inside `ListNavigationProvider` (the route page).
 */
export function FollowingPageView({ following, signIn, serverToday }: FollowingPageViewProps) {
  const t = useTranslations('follows')
  const daily = useTranslations('daily')
  const tagNames = useTranslations('tags')
  const locale = useLocale() as Locale
  // The daily list's paging pill.
  const pill =
    'inline-flex h-10 items-center rounded-pill border border-line bg-bg px-6 text-meta text-ink-2 transition-colors hover:border-ink-4'

  return (
    <main id="main" className="mx-auto flex w-full max-w-content flex-col gap-6 px-4 pt-6 pb-16 md:gap-8 md:pt-10 md:pb-24">
      <h1 className="text-h2 md:text-h1">{t('title')}</h1>

      {following === null ? (
        <div className="flex w-full max-w-105 flex-col gap-5">
          <p className="text-body text-ink-3">{t('signInBody')}</p>
          <Suspense>
            <SignInForm providers={signIn} callbackURL={localizePath(locale, followingPath)} />
          </Suspense>
        </div>
      ) : following.tags.length + following.topics.length === 0 ? (
        <EmptyState icon="plus" title={t('emptyTitle')} body={t('emptyBody')}>
          <ButtonLink href="/news">{t('browseDaily')}</ButtonLink>
        </EmptyState>
      ) : (
        <div className="flex w-full max-w-190 flex-col gap-8">
          <section aria-labelledby="followed" className="flex flex-col gap-4 rounded-card border border-line p-5">
            <h2 id="followed" className="text-title font-semibold">
              {t('followed')} <span className="font-normal text-ink-4">{following.tags.length + following.topics.length}</span>
            </h2>
            {following.tags.length > 0 && (
              <FollowedGroup label={t('tags')}>
                {following.tags.map((tag) => (
                  <Chip key={tag} target={{ type: 'tag', key: tag }} name={tagNames(tag)} href={listHref({ tag })} />
                ))}
              </FollowedGroup>
            )}
            {following.topics.length > 0 && (
              <FollowedGroup label={t('topics')}>
                {following.topics.map((topic) => (
                  <Chip key={topic.key} target={{ type: 'topic', key: topic.key }} name={topic.name} href={topicHref(topic.key)} />
                ))}
              </FollowedGroup>
            )}
          </section>

          <div className="flex flex-col gap-5 md:gap-7">
            <ListResults skeleton={<DailyFeedSkeleton count={Math.min(Math.max(following.stories.stories.length, 3), 6)} />}>
              {following.stories.stories.length > 0 ? (
                <DailyFeed stories={following.stories.stories} serverToday={serverToday} />
              ) : (
                <EmptyState title={t('noStoriesTitle')} body={t('noStoriesBody')} />
              )}
            </ListResults>
            {(following.stories.page > 1 || following.stories.page < following.stories.pages) && (
              <nav aria-label={daily('pages')} className="flex flex-wrap justify-center gap-3 pt-2">
                {following.stories.page > 1 && (
                  <ListLink rel="prev" href={followingHref(following.stories.page - 1)} className={pill}>
                    {daily('loadNewer')}
                  </ListLink>
                )}
                {following.stories.page < following.stories.pages && (
                  <ListLink rel="next" href={followingHref(following.stories.page + 1)} className={pill}>
                    {daily('loadEarlier')}
                  </ListLink>
                )}
              </nav>
            )}
          </div>
        </div>
      )}
    </main>
  )
}

function FollowedGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 md:flex-row md:items-start md:gap-4">
      <h3 className="flex-none text-meta text-ink-4 md:w-28 md:pt-2">{label}</h3>
      <ul className="flex flex-wrap gap-2">{children}</ul>
    </div>
  )
}

/** A followed tag, company or product: its name leads to its page, the × unfollows it. */
function Chip({ target, name, href }: { target: FollowTarget; name: string; href: `/${string}` }) {
  return (
    <li className="flex min-h-8.5 flex-wrap items-center gap-0.5 rounded-pill border border-line bg-bg py-0.5 pr-0.5 pl-3.5 text-meta">
      <Link href={href} className="wrap-anywhere hover:text-accent-ink">
        {name}
      </Link>
      <RemoveFollow target={target} name={name} />
    </li>
  )
}
