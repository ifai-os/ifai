import { useTranslations } from 'next-intl'

import { InitialTile, toneFor } from '@/components/cards/initial-tile'
import { Link } from '@/i18n/navigation'
import { initialOf } from '@/modules/apps/localized'

import type { EntryRef, TopicRef } from '../data'
import { entryHref, topicHref } from '../links'

/** The type of an entry, as a small grey tag (概念 / 方法). */
export function EntryTypeTag({ type }: { type: EntryRef['type'] }) {
  const t = useTranslations('wiki')
  return <span className="rounded-tag bg-surface-2 px-1.5 py-0.5 text-small text-ink-2">{t(`types.${type}`)}</span>
}

/** The initial tile an entry gets wherever it is listed: the same tone for the same entry everywhere. */
export function EntryTile({ entry, size = 'md' }: { entry: Pick<EntryRef, 'slug' | 'title'>; size?: 'sm' | 'md' | 'lg' | 'xl' }) {
  return <InitialTile label={initialOf(entry.title.value)} tone={toneFor(entry.slug)} size={size} />
}

type EntryListProps = {
  entries: (EntryRef & { topics?: TopicRef[] })[]
  /** Numbered in reading order (a topic's「先读这几个」). */
  numbered?: boolean
}

/**
 * Entries one per row: name, type, one-sentence definition and, in 全部条目, their topics. The whole
 * row opens the entry (the name's link covers it); the topic links sit above that.
 */
export function EntryList({ entries, numbered = false }: EntryListProps) {
  const List = numbered ? 'ol' : 'ul'
  return (
    <List className="flex flex-col">
      {entries.map((entry, index) => (
        <li key={entry.id} className="relative flex items-start gap-3 border-b border-hairline py-3.5 last:border-b-0">
          {numbered ? (
            <span aria-hidden="true" className="flex size-10 flex-none items-center justify-center rounded-tile bg-surface text-title font-semibold text-ink-2 tabular-nums">
              {index + 1}
            </span>
          ) : (
            <EntryTile entry={entry} />
          )}
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <Link href={entryHref(entry.slug)} lang={entry.title.lang} className="text-title font-medium after:absolute after:inset-0 hover:text-accent-ink">
                {entry.title.value}
              </Link>
              <EntryTypeTag type={entry.type} />
            </div>
            {entry.definition && (
              <p lang={entry.definition.lang} className="text-ui text-ink-3">
                {entry.definition.value}
              </p>
            )}
            {entry.topics && entry.topics.length > 0 && (
              <p className="flex flex-wrap gap-x-3 text-meta text-ink-4">
                {entry.topics.map((topic) => (
                  <Link key={topic.id} href={topicHref(topic.slug)} lang={topic.name.lang} className="relative hover:text-ink">
                    {topic.name.value}
                  </Link>
                ))}
              </p>
            )}
          </div>
        </li>
      ))}
    </List>
  )
}

/** Entries as compact links with their definition, for the relations under an entry. */
export function EntryLinks({ entries }: { entries: EntryRef[] }) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {entries.map((entry) => (
        <li key={entry.id}>
          <Link
            href={entryHref(entry.slug)}
            className="group flex h-full flex-col gap-1 rounded-card border border-surface-2 px-4 py-3.5 transition-colors hover:border-line"
          >
            <span className="flex flex-wrap items-center gap-2">
              <span lang={entry.title.lang} className="text-body font-medium group-hover:text-accent-ink">
                {entry.title.value}
              </span>
              <EntryTypeTag type={entry.type} />
            </span>
            {entry.definition && (
              <span lang={entry.definition.lang} className="line-clamp-2 text-meta text-ink-3">
                {entry.definition.value}
              </span>
            )}
          </Link>
        </li>
      ))}
    </ul>
  )
}
