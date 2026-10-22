/**
 * Sample apps for local development and the CI smoke tests (tests/e2e/apps.spec.ts).
 * The apps are fictional (websites on .example). Runs only against a database on this
 * machine, so it can never put sample apps on a real site. Safe to run again: apps are
 * matched by slug and overwritten.
 *
 *   pnpm payload run scripts/seed-apps.ts
 */
import config from '@payload-config'
import { getPayload } from 'payload'

import type { App } from '../src/payload-types'
import { databaseUrl } from '../src/lib/db/url'

type Profile = Partial<Pick<App, 'tagline' | 'description' | 'features' | 'faqs' | 'tags'>>

type SampleApp = Pick<App, 'name' | 'slug' | 'status' | 'website'> &
  Partial<Pick<App, 'developer' | 'aliases' | 'pricing' | 'platforms' | 'listedAt'>> & {
    category: string
    alsoIn?: string[]
    alternatives?: string[]
    /** English is required; zh-Hant comes from zh-Hans; a missing language falls back to English. */
    profile: { en: Profile } & Partial<Record<'zh-Hans' | 'ja' | 'ko', Profile>>
  }

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
    listedAt: '2026-09-01T00:00:00.000Z',
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
    listedAt: '2026-10-01T00:00:00.000Z',
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
    listedAt: '2026-10-20T00:00:00.000Z',
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

const localHosts = new Set(['localhost', '127.0.0.1', '[::1]'])

function assertLocalDatabase() {
  let host = ''
  try {
    host = new URL(databaseUrl()).hostname
  } catch {
    // Reported below.
  }
  if (!localHosts.has(host)) {
    console.error(`Refusing to add sample apps: the database is on "${host || 'unknown'}", not this machine.`)
    process.exit(1)
  }
}

assertLocalDatabase()
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
  const { category, alsoIn = [], alternatives = [], profile, ...fields } = app
  alternativesOf.set(app.slug, alternatives)
  const data = {
    ...fields,
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

console.log(`Sample apps ready: ${sampleApps.map((app) => `${app.slug} (${app.status})`).join(', ')}`)
process.exit(0)
