import { getTranslations } from 'next-intl/server'
import type { ReactNode } from 'react'

import { ButtonLink } from '@/components/button'
import { tileTones } from '@/components/cards/initial-tile'
import { EmptyState } from '@/components/states/empty-state'
import type { Locale } from '@/i18n/config'
import { Link } from '@/i18n/navigation'
import { SearchBox } from '@/modules/search/components/search-box'

import { getTopicsWithEntries, getWikiHome } from '../data'
import { entriesHref, entryHref, topicHref } from '../links'
import { EntryTile, EntryTypeTag } from './entry-list'
import { FactBox } from './fact-box'
import { WikiSidebar } from './wiki-sidebar'

const bold = (chunks: ReactNode) => <b className="font-semibold text-ink">{chunks}</b>

/**
 * The Wiki home (board「IFAI Wiki」, as docs/specs/wiki.md「设计稿」trims it): welcome with the
 * Wiki-only search and the real counts, 今日条目, 按主题浏览, 最新条目 and 你知道吗, with the
 * topics and types in a left column on wide screens.
 */
export async function WikiHome({ locale }: { locale: Locale }) {
  const t = await getTranslations('wiki')
  const [home, sideTopics] = await Promise.all([getWikiHome(locale), getTopicsWithEntries(locale)])
  const featured = home.featured

  return (
    <main id="main" className="mx-auto flex w-full max-w-nav gap-10 px-4 pt-5 pb-16 md:pt-7 md:pb-24">
      <WikiSidebar topics={sideTopics} types={home.types} />

      <div className="flex min-w-0 flex-1 flex-col gap-7">
        <section className="flex flex-wrap gap-4">
          <div className="flex flex-3 basis-105 flex-col gap-4.5 rounded-hero border border-surface-2 bg-surface p-5 md:p-7">
            <div className="flex flex-col gap-2">
              <h1 className="text-h2 md:text-h1">{t('welcome')}</h1>
              <p className="text-body text-ink-2">{t('intro')}</p>
            </div>
            <SearchBox locale={locale} type="wiki" label={t('searchLabel')} placeholder={t('searchPlaceholder')} className="h-12 bg-bg" />
            <p className="flex flex-wrap gap-x-6 gap-y-1 text-meta text-ink-4">
              <span>{t.rich('entryCount', { count: home.entries, b: bold })}</span>
              <span>{t.rich('topicCount', { count: home.topics.length, b: bold })}</span>
            </p>
          </div>

          {featured && (
            <Link
              href={entryHref(featured.slug)}
              className="group flex flex-2 basis-75 flex-col gap-3 rounded-hero border border-surface-2 bg-surface p-5 transition-colors hover:border-line md:p-6"
            >
              <span className="text-small font-medium text-accent-ink">{t('today')}</span>
              <span className="flex items-center gap-3">
                <EntryTile entry={featured} size="xl" />
                <span className="flex min-w-0 flex-col gap-1">
                  <span lang={featured.title.lang} className="text-h3 font-semibold group-hover:text-accent-ink">
                    {featured.title.value}
                  </span>
                  <span className="self-start">
                    <EntryTypeTag type={featured.type} />
                  </span>
                </span>
              </span>
              {featured.definition && (
                <span lang={featured.definition.lang} className="text-meta text-ink-2">
                  {featured.definition.value}
                </span>
              )}
            </Link>
          )}
        </section>

        {home.entries === 0 ? (
          <EmptyState icon="wiki" title={t('emptyTitle')} body={t('emptyBody')}>
            <ButtonLink href="/daily" variant="secondary">
              {t('toDaily')}
            </ButtonLink>
          </EmptyState>
        ) : (
          <>
            <section aria-labelledby="wiki-topics" className="flex flex-col gap-3.5">
              <h2 id="wiki-topics" className="text-h3 font-semibold">
                {t('topicsTitle')}
              </h2>
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {home.topics.map((topic, index) => (
                  <li key={topic.id} className={`relative isolate flex flex-col gap-2.5 rounded-dialog p-4.5 ${tileTones[(index + 1) % tileTones.length]}`}>
                    {/* The whole card opens the topic: the overlay sits above the faded text (opacity lifts it) and below the must-read links. */}
                    <Link href={topicHref(topic.slug)} className="flex items-baseline justify-between gap-3 after:absolute after:inset-0 after:z-1 hover:underline">
                      <span lang={topic.name.lang} className="text-title font-semibold">
                        {topic.name.value}
                      </span>
                      <span className="flex-none text-small opacity-90">{t('entries', { count: topic.count })}</span>
                    </Link>
                    {topic.intro && (
                      <p lang={topic.intro.lang} className="line-clamp-3 text-meta opacity-90">
                        {topic.intro.value}
                      </p>
                    )}
                    {topic.mustRead.length > 0 && (
                      <p className="mt-auto flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-meta">
                        <span className="opacity-90">{t('startWith')}</span>
                        {topic.mustRead.map((entry, position) => (
                          <span key={entry.id} className="contents">
                            {position > 0 && (
                              <span aria-hidden="true" className="opacity-60">
                                ·
                              </span>
                            )}
                            <Link href={entryHref(entry.slug)} lang={entry.title.lang} className="relative z-2 font-medium underline-offset-2 hover:underline">
                              {entry.title.value}
                            </Link>
                          </span>
                        ))}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </section>

            <div className="flex flex-wrap gap-4">
              <section aria-labelledby="wiki-newest" className="flex flex-1 basis-80 flex-col gap-3 rounded-hero border border-surface-2 px-5.5 py-5">
                <div className="flex items-baseline justify-between gap-3">
                  <h2 id="wiki-newest" className="text-title">
                    {t('newest')}
                  </h2>
                  <Link href={entriesHref()} className="flex min-h-11 items-center text-meta text-ink-4 hover:text-ink">
                    {t('seeAll')}
                  </Link>
                </div>
                <ul className="flex flex-wrap gap-2">
                  {home.newest.map((entry) => (
                    <li key={entry.id}>
                      <Link
                        href={entryHref(entry.slug)}
                        lang={entry.title.lang}
                        className="flex min-h-9 items-center rounded-pill bg-surface px-3.5 text-meta text-ink hover:bg-surface-2"
                      >
                        {entry.title.value}
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>

              {home.facts.length > 0 && (
                <FactBox
                  facts={home.facts.map(({ fact, entry }) => ({
                    fact: fact.value,
                    lang: fact.lang,
                    href: entryHref(entry.slug),
                    link: t('toEntry', { title: entry.title.value }),
                  }))}
                  labels={{ title: t('didYouKnow'), another: t('anotherFact') }}
                />
              )}
            </div>
          </>
        )}
      </div>
    </main>
  )
}
