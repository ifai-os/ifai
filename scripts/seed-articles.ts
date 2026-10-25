/**
 * Sample articles for the recommend module (docs/specs/recommend.md), for local development, the
 * CI smoke tests (tests/e2e/recommend.spec.ts) and previews: several channels and languages, three
 * picks, tags, headings for a table of contents, a list, a quote, a code block, a picture with a
 * caption, and a draft and a hidden article that must not show. The articles are fictional. Runs
 * only against a database on this machine, or a preview when asked (./seed-target.ts), so it can
 * never put sample articles on a real site. Safe to run again: articles are matched by title and
 * overwritten.
 *
 *   pnpm payload run scripts/seed-articles.ts
 */
import config from '@payload-config'
import { getPayload } from 'payload'
import sharp from 'sharp'

import type { Article } from '../src/payload-types'
import { assertSeedTarget } from './seed-target'

const target = assertSeedTarget('sample articles')
const payload = await getPayload({ config })

// ── Lexical JSON, by hand ────────────────────────────────

type Node = Record<string, unknown>

const text = (value: string, format = 0): Node => ({ type: 'text', text: value, format, detail: 0, mode: 'normal', style: '', version: 1 })
const block = (type: string, children: Node[], extra: Node = {}): Node => ({ type, children, direction: 'ltr', format: '', indent: 0, version: 1, ...extra })
const p = (...parts: (string | Node)[]) => block('paragraph', parts.map((part) => (typeof part === 'string' ? text(part) : part)), { textFormat: 0 })
const h2 = (value: string) => block('heading', [text(value)], { tag: 'h2' })
const h3 = (value: string) => block('heading', [text(value)], { tag: 'h3' })
const bold = (value: string) => text(value, 1)
const code = (value: string) => text(value, 16)
const quote = (value: string) => block('quote', [text(value)])
const list = (items: string[], ordered = false) =>
  block(
    'list',
    items.map((item, index) => block('listitem', [text(item)], { value: index + 1 })),
    { listType: ordered ? 'number' : 'bullet', start: 1, tag: ordered ? 'ol' : 'ul' },
  )
const link = (value: string, url: string): Node => ({
  type: 'link',
  children: [text(value)],
  direction: 'ltr',
  format: '',
  indent: 0,
  version: 3,
  fields: { url, newTab: true, linkType: 'custom' },
})
const codeBlock = (value: string, language = 'typescript'): Node => ({
  type: 'block',
  version: 2,
  format: '',
  fields: { id: `sample-${value.length}`, blockName: '', blockType: 'Code', language, code: value },
})
const picture = (media: number, caption: string): Node => ({
  type: 'upload',
  version: 3,
  format: '',
  relationTo: 'media',
  value: media,
  fields: { caption },
})
const doc = (...children: (Node | null)[]): Article['body'] =>
  ({ root: { type: 'root', children: children.filter(Boolean), direction: 'ltr', format: '', indent: 0, version: 1 } }) as Article['body']

// ── Pictures ─────────────────────────────────────────────

// Uploads made here without R2 stay on this machine (./media), out of a preview's reach: there the
// articles go without pictures (as the sample stories).
const uploads = target === 'local' || ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET'].every((name) => process.env[name])

const drawings = {
  cover: {
    filename: 'sample-article-cover.png',
    alt: 'Sample: documents flowing into an assistant that answers with sources',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="1360" height="680">
      <rect width="1360" height="680" fill="#e9e5f5"/>
      <rect x="120" y="150" width="260" height="340" rx="20" fill="#ffffff"/><rect x="150" y="190" width="180" height="16" rx="8" fill="#3b3550"/>
      <rect x="150" y="230" width="200" height="12" rx="6" fill="#acaeb3"/><rect x="150" y="260" width="170" height="12" rx="6" fill="#cdcdce"/>
      <rect x="160" y="120" width="260" height="340" rx="20" fill="#ffffff" opacity="0.6"/>
      <path d="M440 330 h140" stroke="#da282a" stroke-width="14" stroke-linecap="round"/><path d="M550 290 l45 40 l-45 40" fill="none" stroke="#da282a" stroke-width="14" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="760" cy="330" r="110" fill="#2a2d3a"/><circle cx="725" cy="310" r="14" fill="#ffffff"/><circle cx="795" cy="310" r="14" fill="#ffffff"/>
      <rect x="930" y="200" width="320" height="260" rx="24" fill="#ffffff"/><rect x="965" y="240" width="250" height="16" rx="8" fill="#2a2d3a"/>
      <rect x="965" y="280" width="220" height="12" rx="6" fill="#acaeb3"/><rect x="965" y="310" width="240" height="12" rx="6" fill="#acaeb3"/>
      <rect x="965" y="380" width="70" height="36" rx="18" fill="#e2ebf5"/><rect x="1045" y="380" width="70" height="36" rx="18" fill="#e2ebf5"/>
    </svg>`,
  },
  flow: {
    filename: 'sample-article-flow.png',
    alt: 'Sample: question, permission filter, retrieval, answer with sources',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="1360" height="520">
      <rect width="1360" height="520" fill="#f7f7f9"/>
      <rect x="80" y="200" width="220" height="120" rx="20" fill="#ffffff" stroke="#e4e4e5" stroke-width="4"/>
      <rect x="400" y="200" width="220" height="120" rx="20" fill="#fbe3e3"/>
      <rect x="720" y="200" width="220" height="120" rx="20" fill="#e2ebf5"/>
      <rect x="1040" y="200" width="220" height="120" rx="20" fill="#e3eee5"/>
      <path d="M310 260 h80 M630 260 h80 M950 260 h80" stroke="#48494c" stroke-width="8" stroke-linecap="round"/>
    </svg>`,
  },
}

async function upload(drawing: { filename: string; alt: string; svg: string }): Promise<number | null> {
  if (!uploads) return null
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

const cover = await upload(drawings.cover)
const flow = await upload(drawings.flow)

// ── The articles ─────────────────────────────────────────

const now = Date.now()
const hoursAgo = (hours: number) => new Date(now - hours * 3_600_000).toISOString()

type Sample = Pick<Article, 'title' | 'summary' | 'lang' | 'channel' | 'status'> & {
  body: Article['body']
  tags: string[]
  cover?: number | null
  publishedAt: string | null
  pick?: { reason: string; at: string }
}

const samples: Sample[] = [
  {
    title: '示例：把公司知识库接进 Agent，三个月踩过的 5 个坑',
    summary: '检索召回、权限隔离、引用溯源，每一个都比想象中难。这是一篇示例文章。',
    lang: 'zh-Hans',
    channel: 'agents',
    status: 'published',
    tags: ['Agent', 'RAG', '知识库'],
    cover,
    publishedAt: hoursAgo(2),
    pick: { reason: '五个坑都配了做法，接知识库之前值得先读一遍。', at: hoursAgo(1) },
    body: doc(
      p('今年夏天，我们开始把内部文档、工单和会议纪要接进一个问答 Agent。原以为两周就能上线，结果前后改了三个月。下面是最值得提前知道的五件事。'),
      h2('1. 切片比模型更重要'),
      p('按固定字数切片会把表格和步骤列表拦腰截断。我们改成先按标题层级切，再对超长段落做', bold('二次切分'), '，召回准确率明显提升。'),
      codeBlock('const chunks = splitByHeading(doc, [1, 2, 3]).flatMap((part) => splitLong(part, 600))'),
      h2('2. 权限必须跟着文档走'),
      p('检索阶段就要按提问人的权限过滤，而不是生成之后再屏蔽，否则模型会在回答里「转述」出不该看到的内容。'),
      quote('经验：权限过滤放在召回之前，引用来源放在回答之后。'),
      flow ? picture(flow, '带权限过滤的检索流程（示意）') : null,
      h2('3. 没有引用的回答不要信'),
      p('每条回答都附上来源段落，读者点开就能核对。参考 ', link('示例链接', 'https://example.com/rag'), '。'),
      list(['回答里标出引用编号', '引用指向原文段落', '找不到来源时直接说不知道'], true),
      h3('还没写完的两节'),
      p('评测集要从真实提问里来；上线之后才是开始。用 ', code('npm run eval'), ' 每天跑一遍。'),
    ),
  },
  {
    title: 'Sample: an AGENTS.md template that keeps AI code in house style',
    summary: 'Naming, folders and commit messages, written down as rules an assistant can follow. A sample article.',
    lang: 'en',
    channel: 'coding',
    status: 'published',
    tags: ['AI coding', 'agents'],
    publishedAt: hoursAgo(5),
    pick: { reason: 'A short, copyable template with the reasoning behind each rule.', at: hoursAgo(4) },
    body: doc(
      p('Every team has rules nobody wrote down. An assistant cannot guess them, so write them where it reads first.'),
      h2('What goes in'),
      list(['How to run the tests', 'Where new code lives', 'What never to commit']),
      h2('What stays out'),
      p('Anything a linter already checks. Keep the file short enough to read in a minute.'),
    ),
  },
  {
    title: '示例：同一个需求，五个大模型的输出对比',
    summary: '统一提示词、统一温度，跑 200 次后的稳定性和成本账。',
    lang: 'zh-Hans',
    channel: 'models',
    status: 'published',
    tags: ['大模型', '评测'],
    publishedAt: hoursAgo(26),
    pick: { reason: '方法写得清楚，数字可以自己复现。', at: hoursAgo(20) },
    body: doc(p('这是一篇示例文章，只有一段正文。'), p('评测脚本和数据在文末。')),
  },
  {
    title: 'サンプル：プロンプトは短いほど安定する',
    summary: '指示を 7 割削ったら、かえって結果が安定した話。サンプル記事です。',
    lang: 'ja',
    channel: 'prompts',
    status: 'published',
    tags: ['プロンプト'],
    publishedAt: hoursAgo(30),
    body: doc(p('これはサンプル記事です。'), h2('削ったもの'), p('重複した指示と、使われない例。')),
  },
  {
    title: '示例：转岗 AI 产品经理半年，我重新理解了「需求」',
    summary: '模型能力不是功能清单，评估方法比 PRD 更重要。',
    lang: 'zh-Hans',
    channel: 'career',
    status: 'published',
    tags: ['职场', 'rag'],
    publishedAt: hoursAgo(72),
    body: doc(p('这是一篇示例文章。')),
  },
  {
    title: '示例：还没写完的草稿',
    summary: '草稿不出现在网站上。',
    lang: 'zh-Hans',
    channel: 'design',
    status: 'draft',
    tags: [],
    publishedAt: null,
    body: doc(p('草稿。')),
  },
  {
    title: '示例：已隐藏的文章',
    summary: '已隐藏的文章不出现在网站上。',
    lang: 'zh-Hans',
    channel: 'images',
    status: 'hidden',
    tags: ['AI 绘画'],
    publishedAt: hoursAgo(48),
    body: doc(p('已隐藏。')),
  },
]

for (const sample of samples) {
  const data = {
    title: sample.title,
    summary: sample.summary,
    lang: sample.lang,
    channel: sample.channel,
    status: sample.status,
    body: sample.body,
    tags: sample.tags.map((tag) => ({ tag })),
    cover: sample.cover ?? null,
    publishedAt: sample.publishedAt,
    featured: Boolean(sample.pick),
    featuredReason: sample.pick?.reason ?? null,
    featuredAt: sample.pick?.at ?? null,
  }
  const { docs } = await payload.find({ collection: 'articles', where: { title: { equals: sample.title } }, limit: 1, depth: 0 })
  if (docs[0]) await payload.update({ collection: 'articles', id: docs[0].id, data, depth: 0 })
  else await payload.create({ collection: 'articles', data, depth: 0 })
}

console.log(`Sample articles: ${samples.length} (${samples.filter((sample) => sample.pick).length} picked).`)
process.exit(0)
