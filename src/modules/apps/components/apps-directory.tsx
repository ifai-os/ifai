import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'

import { ButtonLink } from '@/components/button'
import { EmptyState } from '@/components/states/empty-state'
import type { Locale } from '@/i18n/config'

import { getCategories, listApps, type CategoryItem } from '../data'
import { listHref } from '../list-params'
import { AppList } from './app-list'
import { CategoryNav } from './category-nav'
import { Pagination } from './pagination'
import { SearchForm } from './search-form'

type AppsDirectoryProps = {
  locale: Locale
  /** The category being shown; null for all apps. */
  category: CategoryItem | null
  q: string
  page: number
}

/** The apps list: heading, search, categories and one page of apps, A–Z. */
export async function AppsDirectory({ locale, category, q, page }: AppsDirectoryProps) {
  const t = await getTranslations('apps')
  const [{ total, categories }, result] = await Promise.all([
    getCategories(locale),
    listApps({ locale, categoryId: category?.id ?? null, q, page }),
  ])
  // Past the last page: answer 404 rather than an empty list under a new address.
  if (page > 1 && result.apps.length === 0) notFound()

  const slug = category?.slug ?? null

  return (
    <main id="main" className="mx-auto flex w-full max-w-content flex-col gap-4 px-4 pt-5 pb-16 md:gap-7 md:pt-8 md:pb-24">
      <header className="flex flex-col gap-1 md:gap-1.5">
        <h1 className="text-h2 md:text-h1">{category ? category.name : t('title')}</h1>
        <p className="text-meta text-ink-4">
          {category ? t('count', { count: category.count }) : t('listed', { count: total })}
        </p>
      </header>

      <SearchForm locale={locale} category={slug} q={q} />

      <div className="flex flex-col gap-4 md:flex-row md:items-start md:gap-10">
        <div className="md:w-47.5 md:flex-none">
          <CategoryNav categories={categories} total={total} current={slug} q={q} />
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-3">
          {q && result.total > 0 && (
            <p role="status" className="text-meta text-ink-4 wrap-anywhere">
              {t('found', { count: result.total, q })}
            </p>
          )}

          {result.apps.length > 0 ? (
            <AppList apps={result.apps} />
          ) : q ? (
            <EmptyState icon="search" title={t('noMatchTitle', { q })} body={t('noMatchBody')}>
              <ButtonLink href={listHref({ category: slug })} variant="secondary">
                {t('clearSearch')}
              </ButtonLink>
              {category && <ButtonLink href={listHref({ q })}>{t('searchEverywhere')}</ButtonLink>}
            </EmptyState>
          ) : category ? (
            <EmptyState title={t('emptyCategoryTitle')} body={t('emptyCategoryBody')}>
              <ButtonLink href="/apps" variant="secondary">
                {t('allApps')}
              </ButtonLink>
            </EmptyState>
          ) : (
            <EmptyState title={t('emptyTitle')} body={t('emptyBody')} />
          )}

          <Pagination category={slug} q={q} page={page} pages={result.pages} />
        </div>
      </div>
    </main>
  )
}
