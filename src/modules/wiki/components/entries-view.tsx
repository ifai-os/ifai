import { getTranslations } from 'next-intl/server'

import { ButtonLink } from '@/components/button'
import { EmptyState } from '@/components/states/empty-state'
import { Link } from '@/i18n/navigation'

import type { EntriesPage } from '../data'
import { entriesHref, wikiHref } from '../links'
import { entryTypes, type EntryType } from '../rules'
import { EntryList } from './entry-list'

const chip = 'flex h-9 items-center rounded-pill border px-3.5 text-meta whitespace-nowrap transition-colors'
const chipOn = 'border-ink bg-ink text-white'
const chipOff = 'border-line bg-bg text-ink-2 hover:border-ink-4'

/** 全部条目 (docs/specs/wiki.md「页面与路由」): every entry by name, one type at a time if asked, 30 a page. */
export async function EntriesView({ result, type }: { result: EntriesPage; type: EntryType | null }) {
  const t = await getTranslations('wiki')
  const { page, pages } = result

  return (
    <main id="main" className="mx-auto flex w-full max-w-read flex-col gap-6 px-4 pt-5 pb-16 md:pt-7 md:pb-24">
      <nav aria-label={t('breadcrumb')} className="text-meta text-ink-4">
        <ol className="flex flex-wrap items-center gap-2">
          <li className="flex items-center gap-2">
            <Link href={wikiHref} className="hover:text-ink">
              {t('title')}
            </Link>
            <span aria-hidden="true">/</span>
          </li>
          <li aria-current="page" className="text-ink">
            {t('allEntries')}
          </li>
        </ol>
      </nav>

      <header className="flex flex-col gap-1.5">
        <h1 className="text-h2 md:text-h1">{type ? t('entriesTypeTitle', { type: t(`typesPlural.${type}`) }) : t('entriesTitle')}</h1>
        <p className="flex flex-wrap gap-x-3 text-ui text-ink-3">
          <span>{t('entriesIntro')}</span>
          <span>{t('entries', { count: result.total })}</span>
        </p>
      </header>

      <nav aria-label={t('typeFilter')}>
        <ul className="flex flex-wrap gap-2">
          {[null, ...entryTypes].map((value) => {
            const active = value === type
            return (
              <li key={value ?? 'all'}>
                <Link href={entriesHref({ type: value })} aria-current={active ? 'page' : undefined} className={`${chip} ${active ? chipOn : chipOff}`}>
                  {value ? t(`typesPlural.${value}`) : t('allTypes')}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      {result.total === 0 ? (
        <EmptyState icon="wiki" title={t('emptyTitle')} body={t('emptyBody')}>
          <ButtonLink href="/daily" variant="secondary">
            {t('toDaily')}
          </ButtonLink>
        </EmptyState>
      ) : (
        <EntryList entries={result.entries} />
      )}

      {pages > 1 && (
        <nav aria-label={t('pages')} className="flex items-center justify-between gap-3 pt-3">
          {page > 1 ? (
            <ButtonLink href={entriesHref({ type, page: page - 1 })} variant="secondary">
              ‹ {t('previous')}
            </ButtonLink>
          ) : (
            <span />
          )}
          <span className="text-meta text-ink-4 tabular-nums">{t('pageOf', { page, pages })}</span>
          {page < pages ? (
            <ButtonLink href={entriesHref({ type, page: page + 1 })} variant="secondary">
              {t('next')} ›
            </ButtonLink>
          ) : (
            <span />
          )}
        </nav>
      )}
    </main>
  )
}
