import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import type { Locale } from '@/i18n/config'
import { alternatesFor } from '@/lib/seo'

import type { Board } from './boards'
import { getApp, type CategoryItem } from './data'
import { listHref } from './list-params'

const descriptionLength = 160

/**
 * Title, description and canonical address of a list page. Searches are kept out of search
 * engines; a sorted list points at the board's own order.
 */
export async function listMetadata({
  locale,
  category,
  q,
  page,
  board,
}: {
  locale: Locale
  category: CategoryItem | null
  q: string
  page: number
  board: Board
}): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: 'apps' })
  const list = q ? t('searchTitle', { q }) : category ? t('categoryTitle', { category: category.name }) : t('title')
  const base = board === 'top' ? list : t('boardTitle', { board: t(`boards.${board}`), title: list })
  const title = page > 1 ? t('pageTitle', { title: base, page }) : base

  if (q) return { title, robots: { index: false, follow: true } }
  return {
    title,
    description: t('description'),
    alternates: alternatesFor(listHref({ category: category?.slug, page, board }), locale),
  }
}

/** Title and description of an app's page from its summary; empty when there is no such app. */
export async function appMetadata(slug: string, locale: Locale): Promise<Metadata> {
  const app = await getApp(slug, locale)
  if (!app) return {}
  const t = await getTranslations({ locale, namespace: 'apps' })
  const summary = app.tagline?.value ?? app.description?.value.replace(/\s+/g, ' ')

  return {
    title: app.tagline ? t('detailTitle', { name: app.name, tagline: app.tagline.value }) : app.name,
    description: summary ? Array.from(summary).slice(0, descriptionLength).join('') : undefined,
    alternates: alternatesFor(`/apps/${app.slug}`, locale),
  }
}
