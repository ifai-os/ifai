import type { Locale } from '@/i18n/config'
import type { InLanguage } from '@/lib/i18n/localized'
import { getHomeApps, searchApps, type AppImage } from '@/modules/apps/data'
import type { StoryCategory } from '@/modules/daily/categories'
import { searchStories } from '@/modules/daily/public/data'
import { storyHref } from '@/modules/daily/public/list-params'
import type { SkillCategory } from '@/modules/resources/categories'
import { getHomeSkills, getSkillsOverview, searchSkills } from '@/modules/resources/public/data'
import { skillHref } from '@/modules/resources/public/list-params'
import { searchWiki } from '@/modules/wiki/data'
import { entryHref } from '@/modules/wiki/links'
import type { EntryType } from '@/modules/wiki/rules'

import { visibleKinds, type SearchKind } from './kinds'

/**
 * Reads for the search page (docs/specs/search.md). Each module searches its own published
 * content with the same rules as its list page; this file only turns the results into rows.
 */

/** Rows per kind under「全部」. */
export const previewShown = 5
/** Rows per page when one kind is picked. */
export const hitsPerPage = 20
const popularApps = 4
const popularSkills = 2

/** Text with the language it is written in, when known (app names are the same in every language). */
export type HitText = { value: string; lang?: Locale }

/** One result row: where it goes, what to call it and the grey line under it. */
export type SearchHit =
  | {
      kind: 'daily'
      key: string
      href: `/${string}`
      title: HitText
      summary: InLanguage<string> | null
      category: StoryCategory
      publishedAt: string
    }
  | {
      kind: 'apps'
      key: string
      href: `/${string}`
      title: HitText
      summary: InLanguage<string> | null
      slug: string
      logo: AppImage | null
      category: string | null
    }
  | {
      kind: 'skills'
      key: string
      href: `/${string}`
      title: HitText
      summary: InLanguage<string> | null
      slug: string
      category: SkillCategory
      author: string
    }
  | {
      kind: 'wiki'
      key: string
      href: `/${string}`
      title: HitText
      summary: InLanguage<string> | null
      slug: string
      type: EntryType
    }

export type KindResult = { kind: SearchKind; total: number; hits: SearchHit[] }

type Window = { offset: number; limit: number }

async function searchKind(kind: SearchKind, q: string, locale: Locale, { offset, limit }: Window): Promise<KindResult> {
  if (kind === 'daily') {
    // Pages of the same size as the window, so the offset always falls on a page boundary.
    const result = await searchStories({ locale, q, page: Math.floor(offset / limit) + 1, limit })
    return {
      kind,
      total: result.total,
      hits: result.stories.map((story) => ({
        kind,
        key: `daily-${story.id}`,
        href: storyHref(story.slug),
        title: story.title,
        summary: story.summary,
        category: story.category,
        publishedAt: story.publishedAt,
      })),
    }
  }
  if (kind === 'apps') {
    const result = await searchApps({ locale, q, offset, limit })
    return {
      kind,
      total: result.total,
      hits: result.apps.map((app) => ({
        kind,
        key: `apps-${app.id}`,
        href: `/apps/${app.slug}`,
        title: { value: app.name },
        summary: app.tagline,
        slug: app.slug,
        logo: app.logo,
        category: app.category?.name ?? null,
      })),
    }
  }
  if (kind === 'wiki') {
    const result = await searchWiki({ locale, q, offset, limit })
    return {
      kind,
      total: result.total,
      hits: result.entries.map((entry) => ({
        kind,
        key: `wiki-${entry.id}`,
        href: entryHref(entry.slug),
        title: entry.title,
        summary: entry.definition,
        slug: entry.slug,
        type: entry.type,
      })),
    }
  }
  const result = await searchSkills({ locale, q, offset, limit })
  return {
    kind,
    total: result.total,
    hits: result.skills.map((skill) => ({
      kind,
      key: `skills-${skill.id}`,
      href: skillHref(skill.slug),
      title: skill.name,
      summary: skill.tagline,
      slug: skill.slug,
      category: skill.category,
      author: skill.author.name,
    })),
  }
}

/** 「全部」: the first few of every launched kind, with each kind's total for its tab. */
export async function searchEverything(q: string, locale: Locale): Promise<KindResult[]> {
  return Promise.all(visibleKinds().map((kind) => searchKind(kind, q, locale, { offset: 0, limit: previewShown })))
}

/**
 * One kind, a page at a time, plus the other kinds' totals for the tabs. The totals come from
 * the same searches with one row each, which every module answers from its own count.
 */
export async function searchOneKind(
  kind: SearchKind,
  q: string,
  locale: Locale,
  page: number,
): Promise<{ result: KindResult; totals: Record<SearchKind, number> }> {
  const kinds = visibleKinds()
  const [result, ...others] = await Promise.all([
    searchKind(kind, q, locale, { offset: (page - 1) * hitsPerPage, limit: hitsPerPage }),
    ...kinds.filter((other) => other !== kind).map((other) => searchKind(other, q, locale, { offset: 0, limit: 1 })),
  ])
  const totals = { daily: 0, apps: 0, skills: 0, wiki: 0 }
  for (const item of [result, ...others]) totals[item.kind] = item.total
  return { result, totals }
}

/**
 * 「热门」under an empty or fruitless search: the hottest apps and the most installed Skills
 * (the newest Skills until anyone has installed one). Names only; clicking one searches it.
 */
export async function popularSearches(locale: Locale): Promise<string[]> {
  const kinds = visibleKinds()
  const [apps, skills] = await Promise.all([
    kinds.includes('apps') ? getHomeApps(locale, popularApps).then(({ trending }) => trending.map((app) => app.name)) : [],
    kinds.includes('skills') ? popularSkillNames(locale) : [],
  ])
  return [...new Set([...apps, ...skills])]
}

async function popularSkillNames(locale: Locale): Promise<string[]> {
  const { mostInstalled } = await getSkillsOverview(locale)
  const skills = mostInstalled.length > 0 ? mostInstalled : (await getHomeSkills(locale)).newest
  return skills.slice(0, popularSkills).map((skill) => skill.name.value)
}
