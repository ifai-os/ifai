import { useTranslations } from 'next-intl'

import { Link } from '@/i18n/navigation'

import type { TopicRef } from '../data'
import { entriesHref, topicHref, wikiHref } from '../links'
import { entryTypes, type EntryType } from '../rules'

type WikiSidebarProps = {
  topics: (TopicRef & { count: number })[]
  types: Record<EntryType, number>
}

const item = 'flex min-h-9 items-center justify-between gap-2 text-ink-2 hover:text-ink'

/**
 * The left column of the Wiki home (board「IFAI Wiki」, trimmed to what exists: docs/specs/wiki.md
 * 「设计稿」): the home and 全部条目, the topics and the two types with their counts. Desktop only;
 * on phones the topics are the page's own cards.
 */
export function WikiSidebar({ topics, types }: WikiSidebarProps) {
  const t = useTranslations('wiki')

  return (
    <aside className="hidden w-47.5 flex-none flex-col gap-6 text-ui md:flex">
      <nav aria-label={t('sideLabel')} className="flex flex-col">
        <Link href={wikiHref} aria-current="page" className={`${item} font-medium text-ink`}>
          {t('home')}
        </Link>
        <Link href={entriesHref()} className={item}>
          {t('allEntries')}
        </Link>
      </nav>
      {topics.length > 0 && (
        <nav aria-labelledby="wiki-side-topics" className="flex flex-col">
          <span id="wiki-side-topics" className="pb-1.5 text-small text-ink-4">
            {t('topics')}
          </span>
          {topics.map((topic) => (
            <Link key={topic.id} href={topicHref(topic.slug)} className={item}>
              <span lang={topic.name.lang} className="truncate">
                {topic.name.value}
              </span>
              <span className="text-small text-ink-4 tabular-nums">{topic.count}</span>
            </Link>
          ))}
        </nav>
      )}
      <nav aria-labelledby="wiki-side-types" className="flex flex-col">
        <span id="wiki-side-types" className="pb-1.5 text-small text-ink-4">
          {t('byType')}
        </span>
        {entryTypes.map((type) => (
          <Link key={type} href={entriesHref({ type })} className={item}>
            {t(`typesPlural.${type}`)}
            <span className="text-small text-ink-4 tabular-nums">{types[type]}</span>
          </Link>
        ))}
      </nav>
    </aside>
  )
}
