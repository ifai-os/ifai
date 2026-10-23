import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import type { Locale } from '@/i18n/config'
import { alternatesFor } from '@/lib/seo'

import { getSkill } from './data'
import { guideHref, isFiltered, skillHref, skillsHref, submitHref, type SkillListParams } from './list-params'

const descriptionLength = 160

/**
 * The list's title and canonical address. Searches, filters and sorts stay out of search
 * engines; a category is its own page.
 */
export async function skillsListMetadata(locale: Locale, params: SkillListParams & { page: number }): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: 'resources' })
  const categories = await getTranslations({ locale, namespace: 'skillCategories' })
  const base = params.q
    ? t('searchTitle', { q: params.q })
    : params.category
      ? t('categoryTitle', { category: categories(params.category) })
      : t('title')
  const title = params.page > 1 ? t('pageTitle', { title: base, page: params.page }) : base
  if (params.q || isFiltered(params) || params.sort !== 'default') return { title, robots: { index: false, follow: true } }
  return {
    title,
    description: t('description'),
    alternates: alternatesFor(skillsHref({ category: params.category, page: params.page }), locale),
  }
}

/** A Skill's page: its name and summary. Fixed version links are kept out of search engines (only the Skill's page is indexed). */
export async function skillMetadata(slug: string, locale: Locale, version?: string): Promise<Metadata> {
  const skill = await getSkill(slug, locale, version)
  if (!skill) return {}
  const t = await getTranslations({ locale, namespace: 'resources' })
  const name = skill.name.value
  const title = version
    ? t('versionTitle', { name, version })
    : skill.tagline
      ? t('detailTitle', { name, tagline: skill.tagline.value })
      : name
  const description = skill.tagline ? Array.from(skill.tagline.value).slice(0, descriptionLength).join('') : undefined
  if (version) return { title, description, robots: { index: false, follow: true } }
  return { title, description, alternates: alternatesFor(skillHref(skill.slug), locale) }
}

/** The install guide: one page per language, in search engines. */
export async function guideMetadata(locale: Locale): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: 'resources' })
  return { title: t('guide.title'), description: t('guide.description'), alternates: alternatesFor(guideHref, locale) }
}

/** The publishing guide and form: one page per language, in search engines (the form needs signing in, the guide does not). */
export async function submitMetadata(locale: Locale): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: 'resources' })
  return { title: t('submit.title'), description: t('submit.description'), alternates: alternatesFor(submitHref, locale) }
}
