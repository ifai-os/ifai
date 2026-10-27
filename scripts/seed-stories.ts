/**
 * Sample stories, and the poster of their day, for local development, the CI smoke tests
 * (tests/e2e/daily.spec.ts) and previews: every category, several days, pictures and videos, tags,
 * companies and products, a topic shared by two stories, and reports that read alike for
 * 「同类事件」. The stories are fictional (sources on .example). Runs only against a database on
 * this machine, or a preview when asked (./seed-target.ts), so it can never put sample stories on
 * a real site. Safe to run again: stories are matched by slug and overwritten.
 *
 *   pnpm payload run scripts/seed-stories.ts
 */
import config from '@payload-config'
import type { PostgresAdapter } from '@payloadcms/db-postgres'
import { sql } from '@payloadcms/db-postgres/drizzle'
import { getPayload } from 'payload'
import sharp from 'sharp'

import type { Story } from '../src/payload-types'
import { EMBEDDING_DIMENSIONS } from '../src/lib/ai/purposes'
import { shanghaiDate } from '../src/lib/shanghai-day'
import { appMentions } from '../src/modules/apps/schema'
import { generatePoster } from '../src/modules/daily/poster/desk'
import { ReviewError } from '../src/modules/daily/review/actions'
import { rawItems } from '../src/modules/daily/schema'
import { assertSeedTarget } from './seed-target'

type Text = Pick<Story, 'title' | 'summary'> & Partial<Pick<Story, 'body' | 'tryIt'>>

type SampleStory = Pick<Story, 'slug' | 'category' | 'status' | 'eventId' | 'representativeItemId' | 'sources' | 'heat'> &
  Partial<Pick<Story, 'heatTrend' | 'tags' | 'entities'>> & {
    publishedAt: string | null
    correctedAt?: string
    /** English is required; zh-Hant comes from zh-Hans; a missing language falls back to English. */
    text: { en: Text } & Partial<Record<'zh-Hans' | 'ja' | 'ko', Text>>
  }

const now = Date.now()
const minutesAgo = (minutes: number) => new Date(now - minutes * 60_000).toISOString()
const day = 24 * 60

const sampleStories: SampleStory[] = [
  {
    // Out five minutes ago by its source: on every reader's "today". Shares its event with the story below.
    slug: 'sample-lumen-chat-adds-shared-workspaces',
    category: 'tools',
    status: 'published',
    eventId: 900001,
    representativeItemId: 900001,
    publishedAt: minutesAgo(5),
    // The hottest event: today's hottest story and first in the last 48 hours, marked new.
    heat: 72,
    heatTrend: 'new',
    // 「行业标签」「涉及的公司与产品」; shares its topic (Lumen Chat) with the fourth story for「话题追踪」.
    tags: ['assistants'],
    entities: [
      { name: 'Lumen Chat', kind: 'product' },
      { name: 'Lumen Labs', kind: 'company' },
    ],
    sources: [
      { name: 'Lumen Labs', role: 'original', url: 'https://lumen-chat.example/blog/shared-workspaces', publishedAt: minutesAgo(5) },
      { name: 'Sample Tech News', role: 'report', url: 'https://news.example/lumen-workspaces', publishedAt: minutesAgo(4) },
      { name: 'Another Outlet', role: 'report', url: 'https://outlet.example/lumen-chat-workspaces', publishedAt: minutesAgo(3) },
      { name: 'Hacker News', role: 'discussion', url: 'https://news.ycombinator.example/item?id=900001', publishedAt: null },
    ],
    text: {
      en: {
        title: 'Sample: Lumen Chat adds shared workspaces for teams',
        summary: 'A made-up assistant now lets a whole team work in one shared workspace. Sample data for development and tests.',
        body: [
          'Lumen Labs, a made-up company, says its assistant Lumen Chat now has shared workspaces: everyone on a team sees the same chats, files and instructions, and new members start with all of them.',
          '## What changes',
          'Until now each person kept their own history. A workspace keeps one history for the team, and its owner decides who can edit the shared instructions.',
          'Workspaces come with the team plan; the company has not said whether the free plan will get them.',
          '## Why it matters',
          'This is sample text for development and tests. It shows how a story body reads with paragraphs and subheadings.',
        ].join('\n\n'),
        tryIt: 'Open a workspace and invite a teammate.',
      },
      'zh-Hans': {
        title: '示例：Lumen Chat 推出团队共享工作区',
        summary: '一个虚构的助手现在支持整个团队共用一个工作区。这是开发和测试用的示例数据。',
        body: [
          '虚构的公司 Lumen Labs 表示，旗下助手 Lumen Chat 新增团队共享工作区：团队里每个人看到同样的对话、文件和指令，新成员加入后也能直接看到全部内容。',
          '## 有什么变化',
          '以前每个人的记录各管各的。工作区让整个团队共用一份记录，由工作区的所有者决定谁能修改共享的指令。',
          '工作区随团队版提供，公司还没说免费版会不会有。',
          '## 为什么值得关注',
          '这是开发和测试用的示例正文，用来看正文带段落和小标题时的样子。',
        ].join('\n\n'),
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
    tags: ['vibe-coding'],
    entities: [
      { name: 'Kitecode', kind: 'product' },
      { name: 'Kite Studio', kind: 'company' },
    ],
    sources: [{ name: 'Kite Studio', role: 'original', url: 'https://kitecode.example/blog/open-weights', publishedAt: minutesAgo(120) }],
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
      { name: 'Orbit Research', role: 'original', url: 'https://orbit-notes.example/research/benchmark', publishedAt: '2026-10-20T08:15:00.000Z' },
      { name: 'Sample Tech News', role: 'report', url: 'https://news.example/orbit-benchmark', publishedAt: '2026-10-20T08:40:00.000Z' },
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
    category: 'tools',
    status: 'published',
    eventId: 900001,
    representativeItemId: 900004,
    publishedAt: '2026-10-19T22:30:00.000Z',
    // Same event, same heat: the hot list shows the event once, by its newest story.
    heat: 72,
    heatTrend: 'new',
    tags: ['assistants'],
    entities: [{ name: 'Lumen Chat', kind: 'product' }],
    sources: [{ name: 'Lumen Labs', role: 'original', url: 'https://lumen-chat.example/blog/workspaces-preview', publishedAt: '2026-10-19T22:30:00.000Z' }],
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
    // Exactly a day earlier: under「昨天」in every time zone.
    slug: 'sample-nimbus-3-reasons-step-by-step',
    category: 'llm',
    status: 'published',
    eventId: 900007,
    representativeItemId: 900007,
    publishedAt: minutesAgo(day),
    heat: 26,
    entities: [
      { name: 'Nimbus 3', kind: 'product' },
      { name: 'Nimbus AI', kind: 'company' },
    ],
    sources: [
      { name: 'Nimbus AI', role: 'original', url: 'https://nimbus-ai.example/blog/nimbus-3', publishedAt: minutesAgo(day) },
      { name: 'Sample Tech News', role: 'report', url: 'https://news.example/nimbus-3', publishedAt: minutesAgo(day - 30) },
      { name: 'Another Outlet', role: 'report', url: 'https://outlet.example/nimbus-3-reasoning', publishedAt: minutesAgo(day - 40) },
    ],
    text: {
      en: {
        title: 'Sample: Nimbus AI releases Nimbus 3, which reasons step by step',
        summary: 'A fictional lab says its new model works through hard problems in steps and checks its own answers. Sample data for development and tests.',
        tryIt: 'Give it a maths puzzle and read how it gets there.',
      },
      'zh-Hans': {
        title: '示例：Nimbus AI 发布会分步推理的 Nimbus 3',
        summary: '一家虚构的实验室称，新模型会把难题拆成几步来解，并检查自己的答案。这是开发和测试用的示例数据。',
        tryIt: '出一道数学题，看它怎么一步步解出来。',
      },
      ja: {
        title: 'サンプル：Nimbus AI が段階的に推論する Nimbus 3 を公開',
        summary: '架空の研究所によると、新しいモデルは難しい問題を段階に分けて解き、自分の答えを確かめます。開発とテスト用のサンプルです。',
        tryIt: '数学パズルを出して、解き方を読んでみてください。',
      },
      ko: {
        title: '샘플: Nimbus AI, 단계별로 추론하는 Nimbus 3 공개',
        summary: '가상의 연구소에 따르면 새 모델은 어려운 문제를 단계별로 풀고 답을 스스로 검토해요. 개발과 테스트용 샘플 데이터예요.',
        tryIt: '수학 퍼즐을 내고 어떻게 푸는지 읽어 보세요.',
      },
    },
  },
  {
    slug: 'sample-quill-raises-funding-for-team-writing',
    category: 'industry',
    status: 'published',
    eventId: 900010,
    representativeItemId: 900010,
    publishedAt: minutesAgo(day + 60),
    heat: 22,
    tags: ['deals', 'assistants'],
    entities: [
      { name: 'Quill', kind: 'product' },
      { name: 'Quill Labs', kind: 'company' },
    ],
    sources: [
      { name: 'Quill Labs', role: 'original', url: 'https://quill.example/blog/series-a', publishedAt: minutesAgo(day + 60) },
      { name: 'Sample Tech News', role: 'report', url: 'https://news.example/quill-series-a', publishedAt: minutesAgo(day + 30) },
    ],
    text: {
      en: {
        title: 'Sample: Quill Labs raises a Series A to bring its writing assistant to teams',
        summary: 'A made-up startup will spend the money on shared drafts and reviews for companies. Sample data for development and tests.',
      },
      'zh-Hans': {
        title: '示例：Quill Labs 完成 A 轮融资，要把写作助手带进企业',
        summary: '一家虚构的创业公司打算用这笔钱给企业做共享草稿和审阅功能。这是开发和测试用的示例数据。',
      },
      ja: {
        title: 'サンプル：Quill Labs がシリーズ A を調達、文章アシスタントを企業向けに',
        summary: '架空のスタートアップは、この資金で企業向けの共有下書きとレビュー機能を作ります。開発とテスト用のサンプルです。',
      },
      ko: {
        title: '샘플: Quill Labs, 시리즈 A 유치…글쓰기 도우미를 기업용으로',
        summary: '가상의 스타트업이 이 자금으로 기업용 공유 초안과 검토 기능을 만들 예정이에요. 개발과 테스트용 샘플 데이터예요.',
      },
    },
  },
  {
    // Two days earlier: a dated heading of its own.
    slug: 'sample-prism-turns-sketches-into-video',
    category: 'aigc',
    status: 'published',
    eventId: 900008,
    representativeItemId: 900008,
    publishedAt: minutesAgo(2 * day),
    heat: 18,
    tags: ['video', 'image'],
    entities: [
      { name: 'Prism', kind: 'product' },
      { name: 'Prism Studio', kind: 'company' },
    ],
    sources: [
      { name: 'Prism Studio', role: 'original', url: 'https://prism.example/blog/sketch-to-video', publishedAt: minutesAgo(2 * day) },
      { name: 'Sample Tech News', role: 'report', url: 'https://news.example/prism-sketch-video', publishedAt: minutesAgo(2 * day - 50) },
    ],
    text: {
      en: {
        title: 'Sample: Prism turns rough sketches into short videos',
        summary: 'A fictional design tool now animates a drawing into a five-second clip. Sample data for development and tests.',
        tryIt: 'Upload a sketch and pick a five-second clip.',
      },
      'zh-Hans': {
        title: '示例：Prism 能把草图变成短视频',
        summary: '一款虚构的设计工具现在能把一张手绘图做成 5 秒的视频片段。这是开发和测试用的示例数据。',
        tryIt: '上传一张草图，选一段 5 秒的片段。',
      },
      ja: {
        title: 'サンプル：Prism がラフスケッチを短い動画に',
        summary: '架空のデザインツールで、手描きの絵から 5 秒の動画クリップを作れるようになりました。開発とテスト用のサンプルです。',
        tryIt: 'スケッチをアップロードして 5 秒のクリップを選んでみてください。',
      },
      ko: {
        title: '샘플: Prism, 러프 스케치를 짧은 영상으로',
        summary: '가상의 디자인 도구에서 손그림 한 장을 5초짜리 영상 클립으로 만들 수 있게 됐어요. 개발과 테스트용 샘플 데이터예요.',
        tryIt: '스케치를 올리고 5초 클립을 골라 보세요.',
      },
    },
  },
  {
    // A company with no product: the company is its topic. One source only.
    slug: 'sample-strider-robot-learns-by-watching',
    category: 'robotics',
    status: 'published',
    eventId: 900009,
    representativeItemId: 900009,
    publishedAt: minutesAgo(2 * day + 150),
    heat: 12,
    tags: ['hardware'],
    entities: [{ name: 'Strider Robotics', kind: 'company' }],
    sources: [
      { name: 'Strider Robotics', role: 'original', url: 'https://strider.example/news/learning-by-watching', publishedAt: minutesAgo(2 * day + 150) },
    ],
    text: {
      en: {
        title: 'Sample: Strider Robotics shows a warehouse robot that learns by watching',
        summary: 'A made-up robot maker says its arm takes on a new task after seeing a person do it a few times. Sample data for development and tests.',
      },
      'zh-Hans': {
        title: '示例：Strider Robotics 展示看人示范就能学会新活的仓库机器人',
        summary: '一家虚构的机器人公司称，它的机械臂看人做几遍，就能接手新的分拣工作。这是开发和测试用的示例数据。',
      },
      ja: {
        title: 'サンプル：Strider Robotics、見て覚える倉庫ロボットを公開',
        summary: '架空のロボットメーカーによると、そのアームは人の作業を数回見るだけで新しい作業を覚えます。開発とテスト用のサンプルです。',
      },
      ko: {
        title: '샘플: Strider Robotics, 보고 배우는 물류 창고 로봇 공개',
        summary: '가상의 로봇 회사에 따르면 이 로봇 팔은 사람이 몇 번 하는 걸 보면 새 작업을 익혀요. 개발과 테스트용 샘플 데이터예요.',
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

const target = assertSeedTarget('sample stories')
const payload = await getPayload({ config })
const db = (payload.db as unknown as PostgresAdapter).drizzle

for (const story of sampleStories) {
  const { text, ...fields } = story
  // A story shows its original source's time (daily.md「发布时间」); the editor approved it ten minutes on.
  const approvedAt = story.publishedAt ? new Date(Math.min(Date.parse(story.publishedAt) + 10 * 60_000, now)).toISOString() : null
  const data = { ...fields, approvedAt, ...text.en }
  const existing = await payload.find({ collection: 'stories', where: { slug: { equals: story.slug } }, limit: 1, depth: 0 })
  const doc = existing.docs[0]
    ? await payload.update({ collection: 'stories', id: existing.docs[0].id, locale: 'en', data, depth: 0 })
    : await payload.create({ collection: 'stories', locale: 'en', data, depth: 0 })

  for (const locale of ['zh-Hans', 'ja', 'ko'] as const) {
    const localized = text[locale]
    if (localized) await payload.update({ collection: 'stories', id: doc.id, locale, data: localized, depth: 0 })
  }
}

// 「同类事件」compares the stories' reports (`raw_items`, embedded by the judging step). Made up here as a few
// weighted themes each, plus `own` for what only that report is about, so the similarities come out as
// planned (the page lists 0.6 and up): Quill and the workspaces 0.68, Quill and the workspaces preview
// 0.64 (the same event: listed once), Nimbus 3 and Kitecode 0.70, Nimbus 3 and Orbit Notes 0.64; any
// other pair 0. The other stories have no report, so no similar events either.
const themes = ['teams', 'workspaces', 'models', 'evaluation'] as const
const sampleReports: Record<string, Partial<Record<(typeof themes)[number] | 'own', number>>> = {
  'sample-lumen-chat-adds-shared-workspaces': { teams: 0.85, workspaces: 0.53 },
  'sample-lumen-chat-announces-workspaces': { teams: 0.8, workspaces: 0.45, own: 0.4 },
  'sample-quill-raises-funding-for-team-writing': { teams: 0.8, own: 0.6 },
  'sample-kitecode-opens-its-model-weights': { models: 0.93, own: 0.37 },
  'sample-nimbus-3-reasons-step-by-step': { models: 0.75, evaluation: 0.65, own: 0.12 },
  'sample-orbit-notes-benchmark': { evaluation: 0.98, own: 0.2 },
}
// A report needs its source: a sample one, disabled so it is never fetched.
const sourceUrl = 'https://news.example/sample-feed.xml'
const sources = await payload.find({ collection: 'sources', where: { url: { equals: sourceUrl } }, limit: 1, depth: 0 })
const sourceId =
  sources.docs[0]?.id ??
  (
    await payload.create({
      collection: 'sources',
      data: {
        name: 'Sample source (never fetched)',
        type: 'rss',
        tier: 'T2',
        use: 'editorial',
        url: sourceUrl,
        intervalMinutes: 60,
        enabled: false,
        notes: 'Sample reports for「同类事件」(scripts/seed-stories.ts).',
      },
      depth: 0,
    })
  ).id
let reports = 0
for (const [index, [slug, reads]] of Object.entries(sampleReports).entries()) {
  const story = sampleStories.find((sample) => sample.slug === slug)
  const url = story?.sources?.[0]?.url
  if (!story?.publishedAt || !url) continue
  const embedding = Array<number>(EMBEDDING_DIMENSIONS).fill(0)
  for (const [theme, weight] of Object.entries(reads)) {
    embedding[theme === 'own' ? themes.length + index : themes.indexOf(theme as (typeof themes)[number])] = weight
  }
  const row = {
    sourceId,
    url,
    title: story.text.en.title,
    publishedAt: new Date(story.publishedAt),
    discoveredAt: new Date(story.publishedAt),
    // Archived, its body skipped: no job takes it up.
    status: 'archived' as const,
    contentStatus: 'skipped' as const,
    embedding,
  }
  await db
    .insert(rawItems)
    .values({ id: story.representativeItemId, ...row })
    .onConflictDoUpdate({ target: rawItems.id, set: row })
  reports++
}

// 「配图与视频」: drawn pictures, and two videos (YouTube's and Vimeo's own demos) with drawn covers. Uploads
// made here without R2 stay on this machine (./media), out of a preview's reach: there the stories go
// without pictures, and the videos keep their players on a dark cover.
const uploads = target === 'local' || ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET'].every((name) => process.env[name])

type Drawing = { filename: string; alt: string; svg: string }

const drawings = {
  workspace: {
    filename: 'sample-story-picture.png',
    alt: 'Sample: a drawn workspace screen',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="750">
      <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e9e5f5"/><stop offset="1" stop-color="#e2ebf5"/></linearGradient></defs>
      <rect width="1200" height="750" fill="url(#g)"/>
      <rect x="160" y="140" width="880" height="470" rx="28" fill="#ffffff"/>
      <rect x="160" y="140" width="220" height="470" rx="28" fill="#2a2d3a"/>
      <rect x="430" y="200" width="420" height="28" rx="14" fill="#3b3550"/>
      <rect x="430" y="260" width="540" height="18" rx="9" fill="#acaeb3"/>
      <rect x="430" y="300" width="480" height="18" rx="9" fill="#cdcdce"/>
      <circle cx="470" cy="420" r="40" fill="#da282a"/><circle cx="540" cy="420" r="40" fill="#0355e3"/><circle cx="610" cy="420" r="40" fill="#2e7d4f"/>
    </svg>`,
  },
  editor: {
    filename: 'sample-story-editor.png',
    alt: 'Sample: a drawn code editor',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="750">
      <rect width="1200" height="750" fill="#1f2024"/>
      <rect x="140" y="110" width="920" height="530" rx="24" fill="#2a2d3a"/>
      <circle cx="184" cy="150" r="9" fill="#da282a"/><circle cx="214" cy="150" r="9" fill="#e8a33d"/><circle cx="244" cy="150" r="9" fill="#2e7d4f"/>
      <rect x="140" y="190" width="920" height="2" fill="#3b3e4c"/>
      <rect x="190" y="230" width="150" height="18" rx="9" fill="#9b8cf2"/><rect x="356" y="230" width="230" height="18" rx="9" fill="#7fb0ff"/>
      <rect x="230" y="276" width="110" height="18" rx="9" fill="#e8a33d"/><rect x="356" y="276" width="330" height="18" rx="9" fill="#cdcdce"/>
      <rect x="230" y="322" width="260" height="18" rx="9" fill="#7fd0a0"/><rect x="506" y="322" width="140" height="18" rx="9" fill="#cdcdce"/>
      <rect x="270" y="368" width="380" height="18" rx="9" fill="#acaeb3"/>
      <rect x="270" y="414" width="190" height="18" rx="9" fill="#7fb0ff"/><rect x="476" y="414" width="250" height="18" rx="9" fill="#e8a33d"/>
      <rect x="230" y="460" width="90" height="18" rx="9" fill="#9b8cf2"/>
      <rect x="190" y="506" width="60" height="18" rx="9" fill="#cdcdce"/>
      <rect x="700" y="440" width="300" height="150" rx="18" fill="#3b3550"/>
      <rect x="730" y="474" width="200" height="16" rx="8" fill="#ffffff"/><rect x="730" y="508" width="240" height="14" rx="7" fill="#acaeb3"/><rect x="730" y="540" width="160" height="14" rx="7" fill="#acaeb3"/>
    </svg>`,
  },
  sketch: {
    filename: 'sample-story-sketch.png',
    alt: 'Sample: a sketch turning into film frames',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="750">
      <rect width="1200" height="750" fill="#f3e9f7"/>
      <g transform="rotate(-4 330 375)">
        <rect x="120" y="170" width="420" height="410" rx="14" fill="#ffffff"/>
        <circle cx="440" cy="270" r="40" fill="none" stroke="#3b3550" stroke-width="6" stroke-dasharray="14 8"/>
        <polyline points="160,520 260,360 330,450 400,330 500,520" fill="none" stroke="#3b3550" stroke-width="7" stroke-linejoin="round" stroke-linecap="round"/>
      </g>
      <path d="M590 375 h80" stroke="#da282a" stroke-width="14" stroke-linecap="round"/><path d="M650 335 l45 40 l-45 40" fill="none" stroke="#da282a" stroke-width="14" stroke-linecap="round" stroke-linejoin="round"/>
      <rect x="740" y="140" width="320" height="470" rx="18" fill="#2a2d3a"/>
      <rect x="770" y="170" width="260" height="120" rx="10" fill="#7fb0ff"/><circle cx="975" cy="205" r="20" fill="#e8a33d"/><polygon points="790,290 850,220 890,260 940,200 1010,290" fill="#2e7d4f"/>
      <rect x="770" y="315" width="260" height="120" rx="10" fill="#7fb0ff"/><circle cx="960" cy="345" r="20" fill="#e8a33d"/><polygon points="790,435 850,365 890,405 940,345 1010,435" fill="#2e7d4f"/>
      <rect x="770" y="460" width="260" height="120" rx="10" fill="#7fb0ff"/><circle cx="945" cy="485" r="20" fill="#e8a33d"/><polygon points="790,580 850,510 890,550 940,490 1010,580" fill="#2e7d4f"/>
    </svg>`,
  },
  robot: {
    filename: 'sample-story-robot.png',
    alt: 'Sample: a drawn warehouse robot arm',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="750">
      <rect width="1200" height="750" fill="#e2ebf5"/>
      <rect x="640" y="150" width="440" height="20" fill="#acaeb3"/><rect x="640" y="330" width="440" height="20" fill="#acaeb3"/><rect x="640" y="510" width="440" height="20" fill="#acaeb3"/>
      <rect x="660" y="80" width="120" height="70" rx="6" fill="#d9a066"/><rect x="800" y="95" width="100" height="55" rx="6" fill="#c98a4b"/><rect x="920" y="70" width="140" height="80" rx="6" fill="#d9a066"/>
      <rect x="680" y="260" width="130" height="70" rx="6" fill="#c98a4b"/><rect x="960" y="250" width="110" height="80" rx="6" fill="#d9a066"/>
      <rect x="660" y="440" width="150" height="70" rx="6" fill="#d9a066"/><rect x="830" y="455" width="110" height="55" rx="6" fill="#c98a4b"/>
      <rect x="140" y="600" width="300" height="60" rx="14" fill="#2a2d3a"/>
      <path d="M290 600 L330 380 L560 300" fill="none" stroke="#3b3550" stroke-width="44" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="290" cy="600" r="34" fill="#da282a"/><circle cx="330" cy="380" r="30" fill="#da282a"/><circle cx="560" cy="300" r="24" fill="#da282a"/>
      <path d="M560 300 l40 -10 m-40 10 l30 34" stroke="#3b3550" stroke-width="16" stroke-linecap="round"/>
      <rect x="590" y="240" width="90" height="60" rx="6" fill="#d9a066"/>
    </svg>`,
  },
} satisfies Record<string, Drawing>

async function upload(drawing: Drawing): Promise<number> {
  const found = await payload.find({ collection: 'media', where: { filename: { equals: drawing.filename } }, limit: 1, depth: 0 })
  if (found.docs[0]) return found.docs[0].id
  const data = await sharp(Buffer.from(drawing.svg)).png().toBuffer()
  const media = await payload.create({
    collection: 'media',
    data: { alt: drawing.alt },
    file: { data, mimetype: 'image/png', name: drawing.filename, size: data.byteLength },
  })
  return media.id
}

const sampleMedia: Record<string, { video?: string; picture: Drawing; credit: string }> = {
  'sample-lumen-chat-adds-shared-workspaces': { picture: drawings.workspace, credit: 'Lumen Labs' },
  'sample-kitecode-opens-its-model-weights': { video: 'https://www.youtube.com/watch?v=M7lc1UVf-VE', picture: drawings.editor, credit: 'Kite Studio' },
  'sample-prism-turns-sketches-into-video': { picture: drawings.sketch, credit: 'Prism Studio' },
  'sample-strider-robot-learns-by-watching': { video: 'https://vimeo.com/76979871', picture: drawings.robot, credit: 'Strider Robotics' },
}
for (const [slug, { video, picture, credit }] of Object.entries(sampleMedia)) {
  const image = uploads ? await upload(picture) : null
  const media: NonNullable<Story['media']> = video
    ? { kind: 'video', videoUrl: video, image, credit }
    : image
      ? { kind: 'image', image, credit }
      : { kind: 'none', image: null, credit: null }
  const { docs } = await payload.find({ collection: 'stories', where: { slug: { equals: slug } }, limit: 1, depth: 0 })
  if (docs[0]) await payload.update({ collection: 'stories', id: docs[0].id, locale: 'en', data: { media }, depth: 0 })
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
console.log(`Sample reports for「同类事件」: ${reports}`)
console.log(uploads ? 'Sample pictures uploaded.' : 'No pictures: without R2 they would stay on this machine (the videos have no covers).')
console.log(`Sample poster: ${poster}`)
console.log(mentions ? `Sample app mentions ready: ${mentions}` : 'No sample apps yet: scripts/seed-apps.ts adds them and matches these stories for「今天提到的应用」.')
process.exit(0)
