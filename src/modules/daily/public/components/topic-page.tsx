import Image from 'next/image'
import { useTranslations } from 'next-intl'

import { buttonClass } from '@/components/button'
import { ListLink, ListResults } from '@/components/states/list-navigation'
import { Link } from '@/i18n/navigation'
import type { AuthProviders } from '@/lib/auth/providers'
import { FollowButton, FollowCount, FollowedNote } from '@/modules/follows/components/follow-button'
import { FollowProvider } from '@/modules/follows/components/follow-provider'
import type { FollowTarget } from '@/modules/follows/target'

import type { TopicPage } from '../story-item'
import { topicHref } from '../list-params'
import { StoryCardsSkeleton } from './daily-skeletons'
import { pageEnd, pagePill, StoryCard } from './story-card'
import { initialOf } from './story-related'

/**
 * A company's or product's topic page (「IFAI 公司与产品话题页」board; docs/specs/daily.md
 * 「公司与产品的话题页」「关注」): the round tile, #name, what it is, how many stories and followers,
 * and「+ 关注」, then the stories about it as cards under their times, newest first. Inside
 * `ListNavigationProvider` (the route page), earlier pages load in place; the follow state is
 * read in the browser.
 */
export function TopicPageView({ topic, serverToday, signIn }: { topic: TopicPage; serverToday: string; signIn: AuthProviders }) {
  const t = useTranslations('daily')
  const names = useTranslations('categories')
  const target: FollowTarget = { type: 'topic', key: topic.key }

  return (
    <main id="main" className="flex w-full flex-1 flex-col bg-surface">
      <FollowProvider targets={[target]} signIn={signIn}>
        <section aria-labelledby="topic-title" className="border-b border-line bg-bg">
          <div className="mx-auto w-full max-w-240 px-4 py-8">
            <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-5">
              <div className="flex min-w-0 items-center gap-4">
                {topic.app?.logo ? (
                  <span
                    aria-hidden="true"
                    className="flex size-16 flex-none overflow-hidden rounded-pill border border-line bg-bg md:size-20"
                  >
                    {/* Logos are small and may be SVG or ICO, so they are not resized. */}
                    <Image
                      src={topic.app.logo.url}
                      alt=""
                      width={topic.app.logo.width ?? 128}
                      height={topic.app.logo.height ?? 128}
                      unoptimized
                      className="size-full object-contain"
                    />
                  </span>
                ) : (
                  <span
                    aria-hidden="true"
                    className={`flex size-16 flex-none items-center justify-center rounded-pill text-h2 md:size-20 md:text-h1 ${
                      topic.kind === 'company' ? 'bg-night text-white' : 'border border-line bg-surface-2 text-ink'
                    }`}
                  >
                    {initialOf(topic.name)}
                  </span>
                )}
                <div className="flex min-w-0 flex-col gap-1.5">
                  <h1 id="topic-title" className="text-h2 font-medium wrap-anywhere md:text-h1 md:font-medium">
                    <span aria-hidden="true" className="text-accent">
                      #
                    </span>
                    {topic.name}
                  </h1>
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-meta text-ink-4">
                    <span>{t(`entityKinds.${topic.kind}`)}</span>
                    {topic.developer && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>
                          {t.rich('topicDeveloper', {
                            name: topic.developer.name,
                            link: (chunks) =>
                              topic.developer?.key ? (
                                <Link href={topicHref(topic.developer.key)} className="text-link hover:underline">
                                  {chunks}
                                </Link>
                              ) : (
                                <span className="text-ink-2">{chunks}</span>
                              ),
                          })}
                        </span>
                      </>
                    )}
                    <span aria-hidden="true">·</span>
                    <span>{t('topicCount', { count: topic.total })}</span>
                    <FollowCount target={target} />
                  </p>
                </div>
              </div>
              <div className="flex flex-none flex-wrap items-center gap-2">
                {topic.app && (
                  <Link href={`/apps/${topic.app.slug}`} className={buttonClass('secondary')}>
                    {t('appPage')}
                    <span className="sr-only">: {topic.app.name}</span>
                  </Link>
                )}
                <FollowButton target={target} name={topic.name} look="page" />
              </div>
            </div>
            <FollowedNote target={target} name={topic.name} />
          </div>
        </section>
      </FollowProvider>

      <div className="mx-auto flex w-full max-w-240 flex-col gap-7 px-4 pt-8 pb-16 md:pb-30">
        {topic.page > 1 && (
          <ListLink rel="prev" href={topicHref(topic.key, topic.page - 1)} className={`${pagePill} self-center`}>
            {t('loadNewer')}
          </ListLink>
        )}
        <ListResults skeleton={<StoryCardsSkeleton count={Math.min(topic.stories.length, 6)} />}>
          <ol className="flex flex-col gap-7">
            {topic.stories.map((story) => (
              <StoryCard key={story.id} story={story} serverToday={serverToday} category={names(story.category)} />
            ))}
          </ol>
        </ListResults>
        <nav aria-label={t('pages')} className="flex justify-center pt-1">
          {topic.page < topic.pages ? (
            <ListLink rel="next" href={topicHref(topic.key, topic.page + 1)} className={pagePill}>
              {t('topicEarlier', { count: topic.earlier })}
            </ListLink>
          ) : (
            <p className={pageEnd}>{t('noEarlier')}</p>
          )}
        </nav>
      </div>
    </main>
  )
}
