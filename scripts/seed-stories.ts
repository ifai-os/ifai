/**
 * Sample stories, and the poster of their day, for local development and the CI smoke tests
 * (tests/e2e/daily.spec.ts). The stories are fictional (sources on .example). Runs only
 * against a database on this machine, or main's preview when asked (./seed-target.ts), so it
 * can never put sample stories on a real site. Safe to run again: stories are matched by slug
 * and overwritten.
 *
 *   pnpm payload run scripts/seed-stories.ts
 */
import config from '@payload-config'
import type { PostgresAdapter } from '@payloadcms/db-postgres'
import { sql } from '@payloadcms/db-postgres/drizzle'
import { getPayload } from 'payload'

import type { Story } from '../src/payload-types'
import { shanghaiDate } from '../src/lib/shanghai-day'
import { appMentions } from '../src/modules/apps/schema'
import { generatePoster } from '../src/modules/daily/poster/desk'
import { ReviewError } from '../src/modules/daily/review/actions'
import { assertSeedTarget } from './seed-target'

type Text = Pick<Story, 'title' | 'summary'> & Partial<Pick<Story, 'tryIt'>>

type SampleStory = Pick<Story, 'slug' | 'category' | 'status' | 'eventId' | 'representativeItemId' | 'sources' | 'heat'> &
  Partial<Pick<Story, 'heatTrend'>> & {
  publishedAt: string | null
  correctedAt?: string
  /** English is required; zh-Hant comes from zh-Hans; a missing language falls back to English. */
  text: { en: Text } & Partial<Record<'zh-Hans' | 'ja' | 'ko', Text>>
}

const now = Date.now()
const minutesAgo = (minutes: number) => new Date(now - minutes * 60_000).toISOString()

const sampleStories: SampleStory[] = [
  {
    // Published a minute ago: on every reader's "today". Shares its event with the story below.
    slug: 'sample-lumen-chat-adds-shared-workspaces',
    category: 'product',
    status: 'published',
    eventId: 900001,
    representativeItemId: 900001,
    publishedAt: minutesAgo(1),
    // The hottest event: today's hottest story and first in the last 48 hours, marked new.
    heat: 72,
    heatTrend: 'new',
    sources: [
      { name: 'Lumen Labs', role: 'original', url: 'https://lumen-chat.example/blog/shared-workspaces', publishedAt: minutesAgo(90) },
      { name: 'Sample Tech News', role: 'report', url: 'https://news.example/lumen-workspaces', publishedAt: minutesAgo(60) },
      { name: 'Another Outlet', role: 'report', url: 'https://outlet.example/lumen-chat-workspaces', publishedAt: minutesAgo(50) },
      { name: 'Hacker News', role: 'discussion', url: 'https://news.ycombinator.example/item?id=900001', publishedAt: null },
    ],
    text: {
      en: {
        title: 'Sample: Lumen Chat adds shared workspaces for teams',
        summary: 'A made-up assistant now lets a whole team work in one shared workspace. Sample data for development and tests.',
        tryIt: 'Open a workspace and invite a teammate.',
      },
      'zh-Hans': {
        title: '示例：Lumen Chat 推出团队共享工作区',
        summary: '一个虚构的助手现在支持整个团队共用一个工作区。这是开发和测试用的示例数据。',
        tryIt: '新建一个工作区，邀请一位同事。',
      },
      ja: {
        title: 'サンプル：Lumen Chat がチーム共有ワークスペースを追加',
        summary: '架空のアシスタントで、チーム全員が一つのワークスペースで作業できるようになりました。開発とテスト用のサンプルです。',
        tryIt: 'ワークスペースを開いて同僚を招待してみてください。',
      },
      ko: {
        title: '샘플: Lumen Chat, 팀 공유 워크스페이스 추가',
        summary: '가상의 어시스턴트에서 팀 전체가 하나의 워크스페이스에서 함께 작업할 수 있게 됐어요. 개발과 테스트용 샘플 데이터예요.',
        tryIt: '워크스페이스를 열고 동료를 초대해 보세요.',
      },
    },
  },
  {
    // No Korean text: the Korean page falls back to English and says so.
    slug: 'sample-kitecode-opens-its-model-weights',
    category: 'open',
    status: 'published',
    eventId: 900002,
    representativeItemId: 900002,
    publishedAt: minutesAgo(120),
    heat: 45,
    heatTrend: 'rising',
    sources: [{ name: 'Kite Studio', role: 'original', url: 'https://kitecode.example/blog/open-weights', publishedAt: minutesAgo(200) }],
    text: {
      en: {
        title: 'Sample: Kitecode publishes the weights of its code model',
        summary: 'A fictional editor maker released its model weights under an open licence. Sample data for development and tests.',
      },
      'zh-Hans': {
        title: '示例：Kitecode 公开代码模型权重',
        summary: '一家虚构的编辑器公司以开放许可发布了模型权重。这是开发和测试用的示例数据。',
      },
      ja: {
        title: 'サンプル：Kitecode がコードモデルの重みを公開',
        summary: '架空のエディタ開発元がモデルの重みをオープンライセンスで公開しました。開発とテスト用のサンプルです。',
      },
    },
  },
  {
    // Fixed instant, corrected later: the page shows the correction time in the reader's zone.
    slug: 'sample-orbit-notes-benchmark',
    category: 'research',
    status: 'published',
    eventId: 900003,
    representativeItemId: 900003,
    publishedAt: '2026-10-20T08:15:00.000Z',
    heat: 30,
    correctedAt: '2026-10-20T10:00:00.000Z',
    sources: [
      { name: 'Orbit Research', role: 'original', url: 'https://orbit-notes.example/research/benchmark', publishedAt: '2026-10-20T07:00:00.000Z' },
      { name: 'Sample Tech News', role: 'report', url: 'https://news.example/orbit-benchmark', publishedAt: '2026-10-20T07:40:00.000Z' },
    ],
    text: {
      en: {
        title: 'Sample: Orbit Notes reports a new summarization benchmark',
        summary: 'A fictional lab says its note-taking model summarizes web pages more accurately. Sample data for development and tests.',
      },
      'zh-Hans': {
        title: '示例：Orbit Notes 发布新的摘要基准测试',
        summary: '一家虚构的实验室称其笔记模型总结网页更准确。这是开发和测试用的示例数据。',
      },
    },
  },
  {
    // Same event as the first story, published earlier: listed there under "more on this story".
    slug: 'sample-lumen-chat-announces-workspaces',
    category: 'product',
    status: 'published',
    eventId: 900001,
    representativeItemId: 900004,
    publishedAt: '2026-10-19T22:30:00.000Z',
    // Same event, same heat: the hot list shows the event once, by its newest story.
    heat: 72,
    heatTrend: 'new',
    sources: [{ name: 'Lumen Labs', role: 'original', url: 'https://lumen-chat.example/blog/workspaces-preview', publishedAt: '2026-10-19T20:00:00.000Z' }],
    text: {
      en: {
        title: 'Sample: Lumen Chat previews team workspaces',
        summary: 'The made-up assistant announced shared workspaces ahead of their launch. Sample data for development and tests.',
      },
      'zh-Hans': {
        title: '示例：Lumen Chat 预告团队工作区',
        summary: '这个虚构的助手在上线前预告了共享工作区。这是开发和测试用的示例数据。',
      },
    },
  },
  {
    slug: 'sample-pending-story',
    category: 'industry',
    status: 'pending',
    eventId: 900005,
    representativeItemId: 900005,
    publishedAt: null,
    heat: 20,
    sources: [{ name: 'Sample Tech News', role: 'original', url: 'https://news.example/pending', publishedAt: null }],
    text: {
      en: { title: 'Sample pending story: never shown on the site', summary: 'Awaiting review.' },
      'zh-Hans': { title: '示例待审新闻：不会出现在站点上', summary: '等待审核。' },
    },
  },
  {
    slug: 'sample-withdrawn-story',
    category: 'industry',
    status: 'withdrawn',
    eventId: 900006,
    representativeItemId: 900006,
    publishedAt: '2026-10-18T09:00:00.000Z',
    heat: 50,
    sources: [{ name: 'Sample Tech News', role: 'original', url: 'https://news.example/withdrawn', publishedAt: null }],
    text: {
      en: { title: 'Sample withdrawn story: never shown on the site', summary: 'Withdrawn by the editor.' },
      'zh-Hans': { title: '示例已撤回新闻：不会出现在站点上', summary: '编辑已撤回。' },
    },
  },
]

assertSeedTarget('sample stories')
const payload = await getPayload({ config })

for (const story of sampleStories) {
  const { text, ...fields } = story
  const data = { ...fields, ...text.en }
  const existing = await payload.find({ collection: 'stories', where: { slug: { equals: story.slug } }, limit: 1, depth: 0 })
  const doc = existing.docs[0]
    ? await payload.update({ collection: 'stories', id: existing.docs[0].id, locale: 'en', data, depth: 0 })
    : await payload.create({ collection: 'stories', locale: 'en', data, depth: 0 })

  for (const locale of ['zh-Hans', 'ja', 'ko'] as const) {
    const localized = text[locale]
    if (localized) await payload.update({ collection: 'stories', id: doc.id, locale, data: localized, depth: 0 })
  }
}

// 「今天提到的应用」on the daily list: the apps job's matches. Written here when scripts/seed-apps.ts ran
// first; run after these stories, seed-apps.ts matches them itself.
const sampleMentions = [
  { app: 'lumen-chat', story: 'sample-lumen-chat-adds-shared-workspaces', matched: 'lumen-chat.example' },
  { app: 'kitecode', story: 'sample-kitecode-opens-its-model-weights', matched: 'kitecode.example' },
]
const [apps, stories] = await Promise.all([
  payload.find({ collection: 'apps', where: { slug: { in: sampleMentions.map((m) => m.app) } }, depth: 0, pagination: false }),
  payload.find({ collection: 'stories', where: { slug: { in: sampleMentions.map((m) => m.story) } }, depth: 0, pagination: false }),
])
const db = (payload.db as unknown as PostgresAdapter).drizzle
let mentions = 0
for (const mention of sampleMentions) {
  const app = apps.docs.find((doc) => doc.slug === mention.app)
  const story = stories.docs.find((doc) => doc.slug === mention.story)
  if (!app || !story?.publishedAt) continue
  const row = {
    appId: app.id,
    storyId: story.id,
    eventId: story.eventId,
    basis: 'domain' as const,
    matched: mention.matched,
    publishedAt: new Date(story.publishedAt),
  }
  await db
    .insert(appMentions)
    .values(row)
    .onConflictDoUpdate({
      target: [appMentions.appId, appMentions.storyId],
      set: { ...row, removedAt: sql`null` },
    })
  mentions++
}

// 「每日 AI 大事」: the poster of the day the newest sample story went up, the stories chosen
// automatically as on the review screen. The images are drawn when first requested.
const newest = sampleStories
  .filter((story) => story.status === 'published' && story.publishedAt)
  .map((story) => story.publishedAt as string)
  .sort()
  .at(-1)
let poster = 'none'
if (newest) {
  const date = shanghaiDate(new Date(newest))
  try {
    const desk = await generatePoster(payload, date, { render: async () => {}, refresh: async () => {} })
    poster = `${date} (${desk.items.length} stories)`
  } catch (error) {
    if (!(error instanceof ReviewError && error.code === 'poster_empty')) throw error
  }
}

console.log(`Sample stories ready: ${sampleStories.map((story) => `${story.slug} (${story.status})`).join(', ')}`)
console.log(`Sample poster: ${poster}`)
console.log(mentions ? `Sample app mentions ready: ${mentions}` : 'No sample apps yet: scripts/seed-apps.ts adds them and matches these stories for「今天提到的应用」.')
process.exit(0)
