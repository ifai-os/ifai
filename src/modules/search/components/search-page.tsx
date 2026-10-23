import { getTranslations } from 'next-intl/server'

import { ButtonLink } from '@/components/button'
import { EmptyState } from '@/components/states/empty-state'
import type { Locale } from '@/i18n/config'

import { hitsPerPage, popularSearches, searchEverything, searchOneKind, type KindResult } from '../data'
import { visibleKinds, type SearchKind } from '../kinds'
import { searchHref, type SearchType } from '../params'
import { HitRow } from './hit-row'
import { KindTabs } from './kind-tabs'
import { PopularSearches } from './popular-searches'
import { SearchBox } from './search-box'

type SearchPageProps = { locale: Locale; q: string; type: SearchType; page: number }

/** The read behind the page: null when the page number is past the last page (the route answers 404). */
export async function loadSearch({ locale, q, type, page }: SearchPageProps) {
  if (!q) return page > 1 ? null : { sections: [], totals: null, pages: 0 }
  if (type === 'all') {
    if (page > 1) return null
    const sections = await searchEverything(q, locale)
    const totals = Object.fromEntries(sections.map((section) => [section.kind, section.total])) as Record<SearchKind, number>
    return { sections, totals, pages: 1 }
  }
  const { result, totals } = await searchOneKind(type, q, locale, page)
  const pages = Math.ceil(result.total / hitsPerPage)
  if (page > Math.max(pages, 1)) return null
  return { sections: [result], totals, pages }
}

type Loaded = NonNullable<Awaited<ReturnType<typeof loadSearch>>>

/** 全站搜索 (docs/specs/search.md): the box, the kind tabs, and the rows or what to try next. */
export async function SearchPage({ locale, q, type, page, loaded }: SearchPageProps & { loaded: Loaded }) {
  const t = await getTranslations({ locale, namespace: 'search' })
  const kinds = visibleKinds()
  const { sections, totals, pages } = loaded
  const found = totals ? kinds.reduce((sum, kind) => sum + totals[kind], 0) : 0
  // What this tab found: everything under「全部」, one kind's total otherwise.
  const shown = type === 'all' ? found : (sections[0]?.total ?? 0)
  const popular = !q || found === 0 ? await popularSearches(locale) : []

  return (
    <main id="main" className="mx-auto flex w-full max-w-read flex-col gap-5 px-4 pt-5 pb-16 md:gap-6 md:pt-8 md:pb-24">
      <header className="flex flex-col gap-1.5">
        <h1 className="text-h2 md:text-h1">{t('title')}</h1>
        <p className="text-ui text-ink-3">{t('intro')}</p>
      </header>

      <SearchBox locale={locale} q={q} type={type} autoFocus={!q} />

      {totals && found > 0 && <KindTabs q={q} current={type} kinds={kinds} totals={totals} />}

      {!q ? (
        <PopularSearches names={popular} />
      ) : found === 0 ? (
        <div className="flex flex-col gap-6">
          <EmptyState icon="search" title={t('noMatchTitle', { q })} body={t('noMatchBody')} />
          <PopularSearches names={popular} />
        </div>
      ) : (
        <>
          {shown > 0 ? (
            <p role="status" className="text-meta text-ink-4 wrap-anywhere">
              {t('found', { count: shown, q })}
            </p>
          ) : (
            <p role="status" className="text-ui text-ink-3 wrap-anywhere">
              {t('noMatchKind', { kind: t(`tabs.${type}`), q })}
            </p>
          )}
          {sections
            .filter((section) => section.total > 0)
            .map((section) => (
              <Section
                key={section.kind}
                section={section}
                q={q}
                preview={type === 'all'}
                title={t(`tabs.${section.kind}`)}
                seeAll={t('seeAll', { count: section.total })}
              />
            ))}
          {type !== 'all' && pages > 1 && (
            <nav aria-label={t('pages')} className="flex items-center justify-between gap-3">
              {page > 1 ? (
                <ButtonLink href={searchHref({ q, type, page: page - 1 })} variant="secondary">
                  ‹ {t('previous')}
                </ButtonLink>
              ) : (
                <span />
              )}
              <span className="text-meta text-ink-4 tabular-nums">{t('pageOf', { page, pages })}</span>
              {page < pages ? (
                <ButtonLink href={searchHref({ q, type, page: page + 1 })} variant="secondary">
                  {t('next')} ›
                </ButtonLink>
              ) : (
                <span />
              )}
            </nav>
          )}
        </>
      )}
    </main>
  )
}

type SectionProps = { section: KindResult; q: string; preview: boolean; title: string; seeAll: string }

/** One kind's rows; under「全部」with its name above and「查看全部」below when it found more. */
function Section({ section, q, preview, title, seeAll }: SectionProps) {
  const id = `search-${section.kind}`
  return (
    <section aria-labelledby={preview ? id : undefined} className="flex flex-col gap-1">
      {preview && (
        <h2 id={id} className="text-title font-semibold">
          {title}
        </h2>
      )}
      <ul className="-mx-2 flex flex-col md:-mx-3">
        {section.hits.map((hit) => (
          <HitRow key={hit.key} hit={hit} />
        ))}
      </ul>
      {preview && section.total > section.hits.length && (
        <ButtonLink href={searchHref({ q, type: section.kind })} variant="secondary" className="self-start">
          {seeAll} ›
        </ButtonLink>
      )}
    </section>
  )
}
