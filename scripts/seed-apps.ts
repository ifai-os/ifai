/**
 * Sample apps for local development and the CI smoke tests (tests/e2e/apps.spec.ts), with a
 * few weeks of heat scored the way the daily job scores it. The apps are fictional (websites
 * on .example). Runs only against a database on this machine, or a preview when asked
 * (./seed-target.ts), so it can never put sample apps on a real site. Safe to run again: apps
 * are matched by slug and overwritten, and their heat is written anew. Run it after
 * scripts/seed-stories.ts to match the sample stories that mention the apps.
 *
 *   pnpm payload run scripts/seed-apps.ts
 */
import config from '@payload-config'
import type { PostgresAdapter } from '@payloadcms/db-postgres'
import { inArray } from '@payloadcms/db-postgres/drizzle'
import { getPayload } from 'payload'

import type { App } from '../src/payload-types'
import { shanghaiDate } from '../src/lib/shanghai-day'
import { scoreApps, type HeatInput } from '../src/modules/apps/heat'
import { addDays, shanghaiMidnight } from '../src/modules/apps/metrics/days'
import { syncMentions } from '../src/modules/apps/metrics/mentions'
import { appMetricsDaily } from '../src/modules/apps/schema'
import { assertSeedTarget } from './seed-target'

type Profile = Partial<Pick<App, 'tagline' | 'description' | 'features' | 'faqs' | 'tags'>>

/** What the heat job reads for an app on one day. */
type Figures = Pick<HeatInput, 'trancoRank' | 'clicks' | 'mentions'>

type SampleApp = Pick<App, 'name' | 'slug' | 'status' | 'website'> &
  Partial<Pick<App, 'developer' | 'aliases' | 'pricing' | 'platforms'>> & {
    /** Listed this many days ago, so the「新上架」board and「本周新上架」keep working. */
    listedDaysAgo?: number
    category: string
    alsoIn?: string[]
    alternatives?: string[]
    /** English is required; zh-Hant comes from zh-Hans; a missing language falls back to English. */
    profile: { en: Profile } & Partial<Record<'zh-Hans' | 'ja' | 'ko', Profile>>
  }

const DAY_MS = 24 * 60 * 60 * 1000
const HOUR_MS = 60 * 60 * 1000
const now = new Date()

const sampleApps: SampleApp[] = [
  {
    name: 'Lumen Chat',
    slug: 'lumen-chat',
    status: 'published',
    website: 'https://lumen-chat.example',
    developer: 'Lumen Labs',
    aliases: ['Lumen'],
    category: 'assistants',
    alsoIn: ['writing'],
    pricing: 'freemium',
    platforms: ['web', 'mobile', 'api'],
    listedDaysAgo: 52,
    profile: {
      en: {
        tagline: 'Sample AI assistant for chat, writing and research',
        description:
          'A made-up assistant used for development and tests. It answers questions, drafts text and reads long documents.',
        features: [
          { title: 'Long documents', detail: 'Reads a whole report and answers questions about it.' },
          { title: 'Writing help', detail: 'Drafts, edits and changes the tone of a text.' },
          { title: 'Web and mobile', detail: 'Works in the browser and on phones.' },
        ],
        faqs: [
          { question: 'Is it free?', answer: 'There is a free plan and a paid plan.' },
          { question: 'Is this a real app?', answer: 'No. It is sample data for development.' },
        ],
        tags: ['chat', 'writing'],
      },
      'zh-Hans': {
        tagline: '示例 AI 助手：对话、写作和资料研究',
        description: '一个虚构的 AI 助手，只用于开发和测试。它能回答问题、起草文字、阅读长文档。',
        features: [
          { title: '长文档', detail: '一次读完整份报告，回答其中的问题。' },
          { title: '写作帮手', detail: '起草、改写，调整语气。' },
          { title: '网页和手机', detail: '浏览器和手机上都能用。' },
        ],
        faqs: [
          { question: '可以免费用吗？', answer: '有免费版和付费版。' },
          { question: '这是真实的应用吗？', answer: '不是，这是开发用的示例数据。' },
        ],
        tags: ['对话', '写作'],
      },
      ja: {
        tagline: '対話・文章作成・リサーチのサンプルAIアシスタント',
        description: '開発とテストのためだけの架空のAIアシスタントです。質問に答え、文章を下書きし、長い資料を読みます。',
        features: [
          { title: '長い資料', detail: 'レポートを丸ごと読み、内容についての質問に答えます。' },
          { title: '文章作成', detail: '下書き、書き直し、トーンの調整。' },
        ],
        faqs: [{ question: '無料で使えますか？', answer: '無料プランと有料プランがあります。' }],
        tags: ['対話', '文章作成'],
      },
    },
  },
  {
    name: 'Kitecode',
    slug: 'kitecode',
    status: 'published',
    website: 'https://kitecode.example',
    developer: 'Kite Studio',
    category: 'coding',
    alsoIn: ['assistants'],
    pricing: 'paid',
    platforms: ['desktop'],
    listedDaysAgo: 22,
    alternatives: ['lumen-chat', 'draft-demo'],
    profile: {
      en: {
        tagline: 'Sample code editor with an AI pair programmer',
        description: 'A made-up code editor for development and tests. It explains code and suggests fixes.',
        features: [
          { title: 'Explain code', detail: 'Select a function and get a plain-language summary.' },
          { title: 'Suggest fixes', detail: 'Points at likely bugs and proposes a patch.' },
        ],
        tags: ['editor'],
      },
      'zh-Hans': {
        tagline: '示例代码编辑器，内置 AI 结对编程',
        description: '一个虚构的代码编辑器，只用于开发和测试。它能解释代码、给出修改建议。',
        features: [
          { title: '解释代码', detail: '选中一个函数，用白话说明它做什么。' },
          { title: '修改建议', detail: '指出可能的错误，给出补丁。' },
        ],
        tags: ['编辑器'],
      },
    },
  },
  {
    name: 'Orbit Notes',
    slug: 'orbit-notes',
    status: 'published',
    website: 'https://orbit-notes.example',
    category: 'assistants',
    pricing: 'free',
    platforms: ['web', 'browser-extension'],
    listedDaysAgo: 3,
    profile: {
      en: { tagline: 'Sample note-taking assistant that summarizes web pages' },
    },
  },
  {
    name: 'Draft Demo',
    slug: 'draft-demo',
    status: 'draft',
    website: 'https://draft-demo.example',
    category: 'assistants',
    profile: {
      en: { tagline: 'Unpublished sample app: never shown on the site' },
    },
  },
]

/** Each published app's figures `ago` days before the latest scored day, from the day after it was listed. */
const sampleFigures: Record<string, (ago: number) => Figures> = {
  // The hottest: its site rank swings a little, then slips over the last ten days.
  'lumen-chat': (ago) => ({
    trancoRank: Math.round(600 * 0.9 ** Math.min(ago, 10) * (1 + 0.4 * Math.sin(Math.max(ago - 10, 0) / 3))),
    clicks: 40 + (ago % 5),
    mentions: 3,
  }),
  // Climbing fast: the top of the rising board and the home page's pick.
  kitecode: (ago) => ({ trancoRank: 2600 + 160 * ago, clicks: 47 - 2 * ago, mentions: ago < 7 ? 2 : 1 }),
  // New this week and not in the Tranco list.
  'orbit-notes': (ago) => ({ trancoRank: null, clicks: 5 - ago, mentions: 1 }),
}

assertSeedTarget('sample apps')
const payload = await getPayload({ config })

const categories = await payload.find({ collection: 'app-categories', limit: 100, depth: 0 })
const categoryId = (slug: string): number => {
  const category = categories.docs.find((doc) => doc.slug === slug)
  if (!category) throw new Error(`Category "${slug}" is missing. Run \`pnpm payload migrate\` first.`)
  return category.id
}

const ids = new Map<string, number>()
const alternativesOf = new Map<string, string[]>()

for (const app of sampleApps) {
  const { category, alsoIn = [], alternatives = [], profile, listedDaysAgo, ...fields } = app
  alternativesOf.set(app.slug, alternatives)
  const data = {
    ...fields,
    ...(listedDaysAgo !== undefined && { listedAt: new Date(now.getTime() - listedDaysAgo * DAY_MS).toISOString() }),
    ...profile.en,
    primaryCategory: categoryId(category),
    secondaryCategories: alsoIn.map(categoryId),
  }
  const existing = await payload.find({
    collection: 'apps',
    where: { slug: { equals: app.slug } },
    limit: 1,
    depth: 0,
  })
  const doc = existing.docs[0]
    ? await payload.update({ collection: 'apps', id: existing.docs[0].id, locale: 'en', data, depth: 0 })
    : await payload.create({ collection: 'apps', locale: 'en', data, depth: 0 })
  ids.set(app.slug, doc.id)

  for (const locale of ['zh-Hans', 'ja', 'ko'] as const) {
    const localized = profile[locale]
    if (localized) await payload.update({ collection: 'apps', id: doc.id, locale, data: localized, depth: 0 })
  }
}

// Alternatives point at other sample apps, so they are set once every app exists.
for (const [slug, alternatives] of alternativesOf) {
  const data = { alternatives: alternatives.map((other) => ids.get(other)).filter((id) => id !== undefined) }
  await payload.update({ collection: 'apps', id: ids.get(slug) as number, data, depth: 0 })
}

// Heat: one row per published app per day after it was listed, up to the latest 06:00 run.
const db = (payload.db as unknown as PostgresAdapter).drizzle
const latestDay = shanghaiDate(new Date(now.getTime() - 6 * HOUR_MS))
const scored = sampleApps.filter((app) => app.status === 'published' && app.listedDaysAgo !== undefined && sampleFigures[app.slug])
const heatOn = new Map<string, number>()
const rows: (typeof appMetricsDaily.$inferInsert)[] = []
for (let ago = Math.max(...scored.map((app) => (app.listedDaysAgo as number) - 1)); ago >= 0; ago--) {
  const day = addDays(latestDay, -ago)
  const createdAt = new Date(shanghaiMidnight(day).getTime() + 6 * HOUR_MS)
  const apps = scored
    .filter((app) => ago < (app.listedDaysAgo as number))
    .map((app) => {
      const appId = ids.get(app.slug) as number
      const domain = new URL(app.website as string).hostname
      return { app, appId, figures: { ...sampleFigures[app.slug](ago), saves: 0, categoryId: categoryId(app.category) }, domain }
    })
  const results = scoreApps(
    apps.map(({ app, appId, figures }) => ({
      appId,
      name: app.name,
      heatBefore: heatOn.get(`${appId}:${addDays(day, -7)}`) ?? null,
      ...figures,
    })),
  )
  for (const [index, result] of results.entries()) {
    const { figures, domain } = apps[index]
    heatOn.set(`${result.appId}:${day}`, result.heat)
    const ranked = figures.trancoRank !== null
    rows.push({ ...figures, ...result, day, trancoDomain: ranked ? domain : null, trancoListId: ranked ? 'SAMPLE' : null, createdAt })
  }
}
await db.delete(appMetricsDaily).where(inArray(appMetricsDaily.appId, [...ids.values()]))
await db.insert(appMetricsDaily).values(rows)

const mentions = await syncMentions(new Date(now.getTime() - 90 * DAY_MS), now)

console.log(`Sample apps ready: ${sampleApps.map((app) => `${app.slug} (${app.status})`).join(', ')}`)
console.log(`Heat: ${rows.length} rows up to ${latestDay}; ${mentions.mentions} mentions in ${mentions.stories} sample stories`)
process.exit(0)
