import { z } from 'zod'

import type { Locale } from '@/i18n/config'
import type { InLanguage } from '@/lib/i18n/localized'
import { boards, defaultSorts, type Board } from '@/modules/apps/boards'
import { getApp, getCategories, getCategory, listApps, type HeatedApp, type Platform, type Pricing, type RankedApp } from '@/modules/apps/data'
import { showTrancoRank } from '@/modules/apps/settings'
import { storyHref } from '@/modules/daily/public/list-params'

import { count, facts, lines, oneLine, utc } from '../markdown'
import { defineOperation, notFound } from './types'
import { fileUrl, langParam, pageParam, pageUrl } from './shared'

/** The AI app directory (docs/specs/apps.md) for agents: boards, categories, one app. */

export type AppItem = {
  slug: string
  url: string
  name: string
  tagline: string | null
  /** The language of `tagline`. */
  lang: Locale | null
  category: { slug: string; name: string } | null
  pricing: Pricing | null
  logo: string | null
  /** 0–100, the daily heat (site rank, clicks and saves on IFAI, mentions in the daily news); null until scored. */
  heat: number | null
  /** Place among all apps by heat. */
  rank: number | null
  /** Heat change over 7 days, in points. */
  change7d: number | null
  listedAt: string | null
}

export const appHref = (slug: string): `/${string}` => `/apps/${slug}`

function appItem(app: HeatedApp | RankedApp, locale: Locale, origin: string): AppItem {
  return {
    slug: app.slug,
    url: pageUrl(origin, locale, appHref(app.slug)),
    name: app.name,
    tagline: app.tagline?.value ?? null,
    lang: app.tagline?.lang ?? null,
    category: app.category ? { slug: app.category.slug, name: app.category.name } : null,
    pricing: app.pricing,
    logo: fileUrl(origin, app.logo?.url),
    heat: app.heat?.heat ?? null,
    rank: app.heat?.rankOverall ?? null,
    change7d: app.heat?.change7d ?? null,
    listedAt: app.listedAt,
  }
}

export function appLine(app: AppItem, index: number): string {
  return lines(
    `${index + 1}. **${app.name}**${app.tagline ? `: ${oneLine(app.tagline)}` : ''}`,
    `   ${facts(app.category?.name, app.pricing, app.heat !== null ? `heat ${app.heat}` : null, app.rank ? `#${app.rank}` : null)}`,
    `   slug \`${app.slug}\` · ${app.url}`,
  )
}

// ── list_apps ──────────────────────────────────────────

/** The list's sorts an agent can ask for; sorting by site rank only while the ranks are shown (APPS_SHOW_TRANCO_RANK). */
const appSorts = ['heat', 'change', 'newest'] as const

export type AppList = { apps: AppItem[]; total: number; page: number; pages: number; heatDay: string | null }

export const listAppsOperation = defineOperation({
  name: 'apps.list',
  tool: 'list_apps',
  title: 'AI apps',
  description:
    'The IFAI directory of AI apps, 50 a page. `board`: top (by heat), rising (heat going up this week) or new (listed in the last 30 days). ' +
    'Narrow with `category` (a slug from app_categories) or `q` (name, alias, tagline or tag). Read one app with read_app.',
  module: 'apps',
  path: '/apps',
  input: z.object({
    lang: langParam,
    board: z.enum(boards).default('top').describe('top, rising or new.'),
    sort: z.enum(appSorts).optional().describe('heat, change (7-day) or newest; each board has its own default.'),
    category: z.string().regex(/^[a-z0-9-]{1,64}$/).optional().describe('A category slug from app_categories.'),
    q: z.string().trim().max(64).optional().describe('Search the name, aliases, tagline and tags.'),
    page: pageParam,
  }),
  async run({ lang, board, sort, category, q, page }, { origin }): Promise<AppList> {
    const found = category ? await getCategory(category, lang) : null
    if (category && !found) throw notFound(`There is no app category "${category}". See app_categories.`)
    const result = await listApps({
      locale: lang,
      categoryId: found?.id ?? null,
      q: q ?? '',
      page,
      board: board as Board,
      sort: sort ?? defaultSorts[board as Board],
    })
    return {
      apps: result.apps.map((app) => appItem(app, lang, origin)),
      total: result.total,
      page,
      pages: Math.max(1, result.pages),
      heatDay: result.heatDay,
    }
  },
  markdown({ apps, total, page, pages, heatDay }, { board }) {
    if (!apps.length) return page > 1 ? `No apps on page ${page}.` : 'No apps match.'
    return lines(
      `${count(total, 'app')} on the ${board} board · page ${page} of ${pages}${heatDay ? ` · heat as of ${heatDay}` : ''}`,
      '',
      apps.map(appLine).join('\n'),
      page < pages ? `\nMore: call again with page=${page + 1}.` : null,
    )
  },
})

// ── app_categories ─────────────────────────────────────

export const appCategories = defineOperation({
  name: 'apps.categories',
  tool: 'app_categories',
  title: 'App categories',
  description: 'The categories of the IFAI app directory, with their slugs (for list_apps) and how many apps each has.',
  module: 'apps',
  path: '/apps/categories',
  input: z.object({ lang: langParam }),
  async run({ lang }, { origin }) {
    const { total, categories } = await getCategories(lang)
    return {
      total,
      categories: categories.map(({ slug, name, count }) => ({ slug, name, count, url: pageUrl(origin, lang, `/apps/category/${slug}`) })),
    }
  },
  markdown({ total, categories }) {
    return lines(`${count(total, 'app')} in ${count(categories.length, 'category', 'categories')}:`, '', ...categories.map((category) => `- ${category.name} · slug \`${category.slug}\` · ${count(category.count, 'app')}`))
  },
})

// ── read_app ───────────────────────────────────────────

export type AppDetailView = AppItem & {
  website: string | null
  developer: string | null
  platforms: Platform[]
  categories: { slug: string; name: string }[]
  description: string | null
  features: { title: string; detail: string | null }[]
  faqs: { question: string; answer: string }[]
  tags: string[]
  screenshot: string | null
  /** The latest scored day's figures; `siteRank` only while IFAI shows site ranks. */
  figures: { day: string; clicks: number; saves: number; mentions: number; siteRank: number | null } | null
  /** The newest daily news about it. */
  news: { slug: string; title: string; url: string; publishedAt: string }[]
  alternatives: AppItem[]
}

const valueOf = <T>(field: InLanguage<T> | null, fallback: T): T => field?.value ?? fallback

export const readApp = defineOperation({
  name: 'apps.read',
  tool: 'read_app',
  title: 'Read an app',
  description:
    'One AI app in full: what it is, key features, FAQ, platforms, pricing, website, developer, heat, the daily news that mentioned it and alternatives.',
  module: 'apps',
  path: '/apps/{slug}',
  input: z.object({
    slug: z.string().regex(/^[a-z0-9][a-z0-9-]{0,99}$/).describe('The app’s slug, from a list or search.'),
    lang: langParam,
  }),
  async run({ slug, lang }, { origin }): Promise<AppDetailView> {
    const app = await getApp(slug, lang)
    if (!app) throw notFound(`No published app has the slug "${slug}".`)
    const latest = app.heat?.latest ?? null
    return {
      ...appItem({ ...app, heat: latest ? { heat: latest.heat, change7d: latest.change7d, rankOverall: latest.rankOverall, rankRising: latest.rankRising, trancoRank: latest.trancoRank } : null }, lang, origin),
      website: app.website,
      developer: app.developer,
      platforms: app.platforms,
      categories: app.categories.map(({ slug: category, name }) => ({ slug: category, name })),
      description: app.description?.value ?? null,
      features: valueOf(app.features, []).map((feature) => ({ title: feature.title, detail: feature.detail ?? null })),
      faqs: valueOf(app.faqs, []).map((faq) => ({ question: faq.question, answer: faq.answer })),
      tags: valueOf(app.tags, []),
      screenshot: fileUrl(origin, app.screenshot?.url),
      figures: latest
        ? { day: latest.day, clicks: latest.clicks, saves: latest.saves, mentions: latest.mentions, siteRank: showTrancoRank() ? latest.trancoRank : null }
        : null,
      news: app.mentions.map((mention) => ({
        slug: mention.slug,
        title: mention.title.value,
        url: pageUrl(origin, lang, storyHref(mention.slug)),
        publishedAt: mention.publishedAt,
      })),
      alternatives: app.alternatives.map((alternative) => appItem(alternative, lang, origin)),
    }
  },
  markdown(app) {
    return lines(
      `# ${app.name}`,
      app.tagline,
      facts(app.category?.name, app.pricing, app.platforms.join(', '), app.developer ? `by ${app.developer}` : null),
      facts(app.heat !== null ? `Heat ${app.heat}/100` : null, app.rank ? `#${app.rank} overall` : null, app.change7d !== null ? `${app.change7d >= 0 ? '+' : ''}${app.change7d} this week` : null),
      `IFAI page: ${app.url}`,
      app.website ? `Website: ${app.website}` : null,
      app.description ? `\n${app.description}` : null,
      app.features.length ? ['\n## Key features', ...app.features.map((feature) => `- **${feature.title}**${feature.detail ? `: ${oneLine(feature.detail)}` : ''}`)].join('\n') : null,
      app.faqs.length ? ['\n## FAQ', ...app.faqs.map((faq) => `- **${oneLine(faq.question)}** ${oneLine(faq.answer)}`)].join('\n') : null,
      app.tags.length ? `\nTags: ${app.tags.join(', ')}` : null,
      app.news.length ? ['\n## In the news', ...app.news.map((story) => `- ${oneLine(story.title)} (${utc(story.publishedAt)}) · slug \`${story.slug}\``)].join('\n') : null,
      app.alternatives.length ? ['\n## Alternatives', ...app.alternatives.map((other) => `- ${other.name}${other.tagline ? `: ${oneLine(other.tagline)}` : ''} · slug \`${other.slug}\``)].join('\n') : null,
    )
  },
})

export const appOperations = [listAppsOperation, appCategories, readApp]
