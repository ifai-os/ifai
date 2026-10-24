import { useTranslations } from 'next-intl'

import { InitialTile, toneFor } from '@/components/cards/initial-tile'
import { Icon } from '@/components/icon'
import { LocalTime } from '@/components/local-time'
import { Link } from '@/i18n/navigation'
import { AppTile } from '@/modules/apps/components/app-tile'
import { initialOf } from '@/modules/apps/localized'

import type { SearchHit } from '../data'

/**
 * One result (「空状态与加载状态」board, 搜索无结果): icon, title, a one-line summary, and a grey
 * line that says what kind of thing it is (PRD R15: the link's type is visible).
 */
export function HitRow({ hit }: { hit: SearchHit }) {
  const t = useTranslations('search')
  const daily = useTranslations('categories')
  const skills = useTranslations('skillCategories')
  const wiki = useTranslations('wiki')

  const details =
    hit.kind === 'daily'
      ? [daily(hit.category)]
      : hit.kind === 'apps'
        ? [hit.category]
        : hit.kind === 'wiki'
          ? [wiki(`types.${hit.type}`)]
          : [skills(hit.category), hit.author]

  return (
    <li>
      <Link href={hit.href} className="group flex items-start gap-3 rounded-tile px-2 py-3 hover:bg-surface md:px-3">
        {hit.kind === 'daily' || hit.kind === 'wiki' ? (
          <span aria-hidden="true" className="flex size-10 flex-none items-center justify-center rounded-tile bg-surface-2 text-ink-2">
            <Icon name={hit.kind} size={20} />
          </span>
        ) : hit.kind === 'apps' ? (
          <AppTile name={hit.title.value} slug={hit.slug} logo={hit.logo} size="md" />
        ) : (
          <InitialTile label={initialOf(hit.title.value)} tone={toneFor(hit.slug)} size="md" />
        )}
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span lang={hit.title.lang} className="text-title font-medium text-ink group-hover:text-accent">
            {hit.title.value}
          </span>
          {hit.summary && (
            <span lang={hit.summary.lang} className="truncate text-ui text-ink-3">
              {hit.summary.value}
            </span>
          )}
          <span className="flex flex-wrap items-center gap-x-1.5 text-meta text-ink-4">
            <span className="font-medium text-ink-2">{t(`kind.${hit.kind}`)}</span>
            {details.filter(Boolean).map((detail) => (
              <span key={detail} className="contents">
                <span aria-hidden="true">·</span>
                <span>{detail}</span>
              </span>
            ))}
            {hit.kind === 'daily' && (
              <>
                <span aria-hidden="true">·</span>
                <LocalTime iso={hit.publishedAt} style="date" />
              </>
            )}
          </span>
        </span>
      </Link>
    </li>
  )
}
