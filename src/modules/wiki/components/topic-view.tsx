import { getTranslations } from 'next-intl/server'

import { EmptyState } from '@/components/states/empty-state'
import { Link } from '@/i18n/navigation'

import type { TopicDetail } from '../data'
import { wikiHref } from '../links'
import { EntryList } from './entry-list'

/**
 * A topic's page (docs/specs/wiki.md「页面与路由」): its introduction first, then「先读这几个」in
 * the editor's reading order, then everything in the topic by type and name. Popularity never
 * stands in for the reading order.
 */
export async function TopicView({ topic }: { topic: TopicDetail }) {
  const t = await getTranslations('wiki')
  const groups = [
    { key: 'concept' as const, entries: topic.concepts },
    { key: 'method' as const, entries: topic.methods },
  ].filter((group) => group.entries.length > 0)

  return (
    <main id="main" className="mx-auto flex w-full max-w-read flex-col gap-7 px-4 pt-5 pb-16 md:pt-7 md:pb-24">
      <nav aria-label={t('breadcrumb')} className="text-meta text-ink-4">
        <ol className="flex flex-wrap items-center gap-2">
          <li className="flex items-center gap-2">
            <Link href={wikiHref} className="hover:text-ink">
              {t('title')}
            </Link>
            <span aria-hidden="true">/</span>
          </li>
          <li aria-current="page" lang={topic.name.lang} className="text-ink">
            {topic.name.value}
          </li>
        </ol>
      </nav>

      <header className="flex flex-col gap-2">
        <h1 lang={topic.name.lang} className="text-h2 md:text-h1">
          {topic.name.value}
        </h1>
        {topic.intro && (
          <p lang={topic.intro.lang} className="text-body text-ink-2">
            {topic.intro.value}
          </p>
        )}
        <p className="text-meta text-ink-4">{t('entries', { count: topic.count })}</p>
      </header>

      {topic.count === 0 ? (
        <EmptyState icon="wiki" title={t('topicEmpty')} />
      ) : (
        <>
          {topic.mustRead.length > 0 && (
            <section aria-labelledby="topic-must-read" className="flex flex-col gap-1">
              <h2 id="topic-must-read" className="text-h3 font-semibold">
                {t('mustRead')}
              </h2>
              <p className="text-meta text-ink-4">{t('mustReadNote')}</p>
              <EntryList entries={topic.mustRead} numbered />
            </section>
          )}
          <section aria-labelledby="topic-all" className="flex flex-col gap-2">
            <h2 id="topic-all" className="text-h3 font-semibold">
              {t('inTopic')}
            </h2>
            {groups.map((group) => (
              <div key={group.key} className="flex flex-col">
                {groups.length > 1 && <h3 className="pt-2 text-ui font-medium text-ink-2">{t(`typesPlural.${group.key}`)}</h3>}
                <EntryList entries={group.entries} />
              </div>
            ))}
          </section>
        </>
      )}
    </main>
  )
}
