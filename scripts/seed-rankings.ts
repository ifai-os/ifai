/**
 * Sample model rankings for local development and the CI smoke tests (tests/e2e/rankings.spec.ts):
 * fictional contestants (OpenRouter IDs under sample/), a few questions per arena with their
 * answers (in 图像生成, pictures drawn here in a few proportions), four weeks of blind votes drawn
 * from made-up strengths, and the last three weekly snapshots computed the way the Monday job
 * computes them. All three arenas are put on the site. Kestrel 3 Coder enters in the last week
 * (「新上榜」) and Fjord Nano has too few votes (「暂定」). Runs only against a database on this
 * machine, or main's preview when asked (./seed-target.ts). Safe to run again: the sample models,
 * questions, answers, pictures and votes and the arenas' snapshots are replaced.
 *
 * Outside boards (「外部榜单」) get a few made-up days too: Arena's 文本 over four months (for
 * 「分数走势」) and 网页开发, and Artificial Analysis's 智能指数 and 语音合成. Only on this machine
 * and into empty tables, so made-up days never sit among real ones: a preview syncs the real
 * boards (「现在同步」), and a database that has synced them keeps them. To sync the real boards
 * into a local database that has the sample ones, empty rankings_external_snapshots first.
 *
 *   pnpm payload run scripts/seed-rankings.ts
 */
import { randomBytes } from 'node:crypto'

import config from '@payload-config'
import type { PostgresAdapter } from '@payloadcms/db-postgres'
import { count, inArray, or } from '@payloadcms/db-postgres/drizzle'
import { getPayload, type Where } from 'payload'
import sharp from 'sharp'

import { locales } from '../src/i18n/config'
import { shanghaiDate } from '../src/lib/shanghai-day'
import { addDays } from '../src/modules/apps/metrics/days'
import { weekOf, type Outcome, type PromptLang, type Region, type Weights } from '../src/modules/rankings/rules'
import { rankByScore, weightsOf, type ExternalRow, type ExternalSource } from '../src/modules/rankings/external/sources'
import { storeSnapshots } from '../src/modules/rankings/external/store'
import { arenaBattles, arenaSnapshots, externalSnapshots } from '../src/modules/rankings/schema'
import { storeSnapshot } from '../src/modules/rankings/snapshot'
import { assertSeedTarget } from './seed-target'

type ArenaSlug = 'text' | 'coding' | 'image'

type SampleModel = {
  name: string
  openrouterId: `sample/${string}`
  /** English is required; a Chinese name goes in zh-Hans (zh-Hant follows). */
  org: { en: string; 'zh-Hans'?: string }
  weights: Weights
  region: Region
  license?: { name: string; url?: string }
  arenas: ArenaSlug[]
  /** The made-up strength the votes are drawn from, on the page's scale (1000 is average). */
  strength: number
  /** Average cost of an answer, US dollars. */
  costUsd: number
  /** In the votes from this many weeks ago: 4 from the start, 1 only in the last full week. */
  since: 1 | 4
  /** How often it is drawn into a vote, 1 by default; a small share keeps it provisional. */
  share?: number
  /** The size an image model draws at. */
  canvas?: readonly [number, number]
}

const apache = { name: 'Apache-2.0', url: 'https://www.apache.org/licenses/LICENSE-2.0' }

const models: SampleModel[] = [
  { name: 'Lumen 4', openrouterId: 'sample/lumen-4', org: { en: 'Lumen Labs' }, weights: 'closed', region: 'us', arenas: ['text', 'coding'], strength: 1150, costUsd: 0.012, since: 4 },
  { name: 'Atlas Pro 2', openrouterId: 'sample/atlas-pro-2', org: { en: 'Atlas AI' }, weights: 'closed', region: 'us', arenas: ['text', 'coding'], strength: 1120, costUsd: 0.018, since: 4 },
  {
    name: 'Kestrel 3',
    openrouterId: 'sample/kestrel-3',
    org: { en: 'Kestrel AI', 'zh-Hans': '红隼智能' },
    weights: 'open',
    region: 'cn',
    license: apache,
    arenas: ['text', 'coding'],
    strength: 1085,
    costUsd: 0.0009,
    since: 4,
  },
  {
    name: 'Kestrel 3 Coder',
    openrouterId: 'sample/kestrel-3-coder',
    org: { en: 'Kestrel AI', 'zh-Hans': '红隼智能' },
    weights: 'open',
    region: 'cn',
    license: apache,
    arenas: ['text', 'coding'],
    strength: 1070,
    costUsd: 0.0007,
    since: 1,
  },
  { name: 'Lumen 4 Mini', openrouterId: 'sample/lumen-4-mini', org: { en: 'Lumen Labs' }, weights: 'closed', region: 'us', arenas: ['text', 'coding'], strength: 1060, costUsd: 0.0021, since: 4 },
  { name: 'Orchid Large', openrouterId: 'sample/orchid-large', org: { en: 'Orchid' }, weights: 'closed', region: 'eu', arenas: ['text'], strength: 1000, costUsd: 0.004, since: 4 },
  {
    name: 'Basalt 70B',
    openrouterId: 'sample/basalt-70b',
    org: { en: 'Basalt Research' },
    weights: 'open',
    region: 'other',
    license: { name: 'Basalt Community License' },
    arenas: ['text', 'coding'],
    strength: 960,
    costUsd: 0.0012,
    since: 4,
  },
  {
    name: 'Tundra 1.5',
    openrouterId: 'sample/tundra-1.5',
    org: { en: 'Tundra', 'zh-Hans': '冻原科技' },
    weights: 'open',
    region: 'cn',
    license: { name: 'MIT', url: 'https://opensource.org/license/mit' },
    arenas: ['text'],
    strength: 930,
    costUsd: 0.0005,
    since: 4,
  },
  { name: 'Fjord Nano', openrouterId: 'sample/fjord-nano', org: { en: 'Fjord' }, weights: 'closed', region: 'eu', arenas: ['text'], strength: 900, costUsd: 0.0003, since: 1, share: 0.15 },
  // The image arena's painters, in four proportions.
  { name: 'Lumen Canvas', openrouterId: 'sample/lumen-canvas', org: { en: 'Lumen Labs' }, weights: 'closed', region: 'us', arenas: ['image'], strength: 1110, costUsd: 0.04, since: 4, canvas: [1024, 1024] },
  {
    name: 'Kestrel Paint',
    openrouterId: 'sample/kestrel-paint',
    org: { en: 'Kestrel AI', 'zh-Hans': '红隼智能' },
    weights: 'open',
    region: 'cn',
    license: apache,
    arenas: ['image'],
    strength: 1050,
    costUsd: 0.003,
    since: 4,
    canvas: [1216, 832],
  },
  { name: 'Orchid Studio', openrouterId: 'sample/orchid-studio', org: { en: 'Orchid' }, weights: 'closed', region: 'eu', arenas: ['image'], strength: 1000, costUsd: 0.02, since: 4, canvas: [832, 1216] },
  {
    name: 'Basalt Diffuse',
    openrouterId: 'sample/basalt-diffuse',
    org: { en: 'Basalt Research' },
    weights: 'open',
    region: 'other',
    license: { name: 'Basalt Community License' },
    arenas: ['image'],
    strength: 940,
    costUsd: 0.002,
    since: 4,
    canvas: [1344, 768],
  },
]

/** The questions; `code` goes into the longer half of the answers. */
const questions: { arena: ArenaSlug; lang: PromptLang; text: string; code?: string }[] = [
  { arena: 'text', lang: 'en', text: 'Write a polite email asking my landlord to fix a leaking kitchen tap this week.' },
  { arena: 'text', lang: 'en', text: 'Explain what inflation is to a 12-year-old in three short paragraphs.' },
  { arena: 'text', lang: 'en', text: 'Plan a three-day trip to Kyoto in autumn on a moderate budget.' },
  { arena: 'text', lang: 'zh-Hans', text: '帮我写一段给新同事的欢迎词，语气轻松，不超过 100 字。' },
  { arena: 'text', lang: 'zh-Hans', text: '用通俗的话解释什么是复利，并举一个例子。' },
  { arena: 'text', lang: 'ja', text: '雨の日に子どもと家で楽しめる遊びを5つ提案してください。' },
  { arena: 'text', lang: 'ko', text: '처음 달리기를 시작하는 사람을 위한 4주 훈련 계획을 짜 주세요.' },
  {
    arena: 'coding',
    lang: 'en',
    text: 'Write a Python function that removes duplicates from a list while keeping the original order.',
    code: '```python\ndef dedupe(items):\n    seen = set()\n    return [x for x in items if not (x in seen or seen.add(x))]\n```',
  },
  { arena: 'coding', lang: 'en', text: 'Explain the difference between let, const and var in JavaScript with short examples.' },
  {
    arena: 'coding',
    lang: 'zh-Hans',
    text: '用 SQL 查出每个部门工资最高的员工，表结构是 employees(id, name, department, salary)。',
    code: '```sql\nselect name, department, salary\nfrom employees e\nwhere salary = (select max(salary) from employees where department = e.department);\n```',
  },
  { arena: 'image', lang: 'en', text: 'A red bicycle leaning against a brick wall in the rain, watercolor.' },
  { arena: 'image', lang: 'en', text: 'A cozy reading nook with a cat asleep on the window seat, warm evening light.' },
  { arena: 'image', lang: 'zh-Hans', text: '水墨风格的山间小屋，清晨有雾，远处有一条小溪。' },
  { arena: 'image', lang: 'ja', text: '桜並木の下を走る路面電車、やわらかいイラスト風。' },
]

/** Marks the sample questions, so a new run finds them. */
const SAMPLE_NOTE = 'Sample question (scripts/seed-rankings.ts)'

const answerText: Record<PromptLang, { intro: (n: number) => string; steps: string }> = {
  en: {
    intro: (n) => `Sample answer ${n}, for development and tests.\n\nA real model's answer goes here, in the question's language.`,
    steps: '1. First, one step.\n2. Then another.\n3. Last, a short check.',
  },
  'zh-Hans': {
    intro: (n) => `示例回答 ${n}，用于开发和测试。\n\n真实模型的回答写在这里，语言和题目一样。`,
    steps: '1. 先做一步。\n2. 再做一步。\n3. 最后检查一下。',
  },
  ja: {
    intro: (n) => `サンプル回答 ${n}（開発とテスト用）。\n\n実際のモデルの回答は、質問と同じ言語でここに入ります。`,
    steps: '1. まず一つ目。\n2. 次に二つ目。\n3. 最後に確認。',
  },
  ko: {
    intro: (n) => `샘플 답변 ${n}(개발과 테스트용).\n\n실제 모델의 답변은 질문과 같은 언어로 여기에 들어갑니다.`,
    steps: '1. 먼저 한 단계.\n2. 그다음 단계.\n3. 마지막으로 확인.',
  },
}

/** Small, seeded and fast, so every run draws the same votes. */
function random(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** A sample picture: soft circles on a gradient, the same on every run for the same seed. */
async function samplePicture(seed: number, [width, height]: readonly [number, number]): Promise<Buffer> {
  const draw = random(seed)
  const hue = Math.floor(draw() * 360)
  const circles = Array.from({ length: 7 }, () => {
    const radius = Math.round((0.08 + draw() * 0.22) * Math.min(width, height))
    const fill = `hsl(${(hue + Math.floor(draw() * 140)) % 360}, 70%, ${45 + Math.floor(draw() * 25)}%)`
    return `<circle cx="${Math.round(draw() * width)}" cy="${Math.round(draw() * height)}" r="${radius}" fill="${fill}" fill-opacity="0.7"/>`
  }).join('')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <defs><linearGradient id="sky" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="hsl(${hue}, 60%, 88%)"/><stop offset="1" stop-color="hsl(${(hue + 50) % 360}, 55%, 40%)"/>
    </linearGradient></defs>
    <rect width="100%" height="100%" fill="url(#sky)"/>${circles}
  </svg>`
  return sharp(Buffer.from(svg)).png().toBuffer()
}

/** Monday 06:00 in Shanghai, when the weekly job takes the week's snapshot. */
const snapshotTime = (week: string) => new Date(`${week}T06:00:00+08:00`)

const target = assertSeedTarget('sample rankings')
const payload = await getPayload({ config })
const db = (payload.db as unknown as PostgresAdapter).drizzle
const context = { skipAnswersEvent: true }
const now = new Date()

// Start over: votes, answers, models and questions of an earlier run.
const [oldModels, oldPrompts] = await Promise.all([
  payload.find({ collection: 'arena-models', where: { openrouterId: { like: 'sample/' } }, pagination: false, depth: 0, select: {} }),
  payload.find({ collection: 'arena-prompts', where: { note: { equals: SAMPLE_NOTE } }, pagination: false, depth: 0, select: {} }),
])
const oldModelIds = oldModels.docs.map((doc) => Number(doc.id))
const oldPromptIds = oldPrompts.docs.map((doc) => Number(doc.id))
if (oldModelIds.length || oldPromptIds.length) {
  const orNone = (ids: number[]) => (ids.length ? ids : [-1])
  const oldAnswers: Where = { or: [{ model: { in: orNone(oldModelIds) } }, { prompt: { in: orNone(oldPromptIds) } }] }
  const { docs: drawn } = await payload.find({ collection: 'arena-answers', where: oldAnswers, pagination: false, depth: 0, select: { image: true } })
  const oldPictureIds = drawn.flatMap((answer) => (answer.image ? [Number(typeof answer.image === 'object' ? answer.image.id : answer.image)] : []))
  await db
    .delete(arenaBattles)
    .where(
      or(
        inArray(arenaBattles.modelAId, orNone(oldModelIds)),
        inArray(arenaBattles.modelBId, orNone(oldModelIds)),
        inArray(arenaBattles.promptId, orNone(oldPromptIds)),
      ),
    )
  await payload.delete({ collection: 'arena-answers', where: oldAnswers, depth: 0 })
  if (oldPictureIds.length) await payload.delete({ collection: 'arena-images', where: { id: { in: oldPictureIds } }, depth: 0 })
  if (oldModelIds.length) await payload.delete({ collection: 'arena-models', where: { id: { in: oldModelIds } }, depth: 0, context })
  if (oldPromptIds.length) await payload.delete({ collection: 'arena-prompts', where: { id: { in: oldPromptIds } }, depth: 0, context })
}

// The migrations add 文本, 编程 and 图像生成; make sure all three are on the site.
const arenaIds = {} as Record<ArenaSlug, number>
for (const slug of ['text', 'coding', 'image'] as const) {
  const { docs } = await payload.find({ collection: 'arenas', where: { slug: { equals: slug } }, limit: 1, depth: 0 })
  if (!docs[0]) throw new Error(`The arena "${slug}" is missing: run pnpm payload migrate first.`)
  if (docs[0].status !== 'published') await payload.update({ collection: 'arenas', id: docs[0].id, data: { status: 'published' } })
  arenaIds[slug] = Number(docs[0].id)
}
await db.delete(arenaSnapshots).where(inArray(arenaSnapshots.arenaId, Object.values(arenaIds)))

const modelIds = new Map<SampleModel, number>()
for (const model of models) {
  const created = await payload.create({
    collection: 'arena-models',
    locale: 'en',
    context,
    data: {
      name: model.name,
      org: model.org.en,
      openrouterId: model.openrouterId,
      weights: model.weights,
      region: model.region,
      license: model.license?.name,
      licenseUrl: model.license?.url,
      arenas: model.arenas.map((arena) => arenaIds[arena]),
      status: 'active',
    },
  })
  const zh = model.org['zh-Hans']
  if (zh) await payload.update({ collection: 'arena-models', id: created.id, locale: 'zh-Hans', context, data: { org: zh } })
  modelIds.set(model, Number(created.id))
}

// Every model answers every question of its arenas, as the answer job would.
const draw = random(42)
const promptIds: Record<ArenaSlug, number[]> = { text: [], coding: [], image: [] }
const answerIds = new Map<string, number>()
let pictures = 0
for (const [questionIndex, question] of questions.entries()) {
  const prompt = await payload.create({
    collection: 'arena-prompts',
    context,
    data: { text: question.text, arena: arenaIds[question.arena], lang: question.lang, status: 'active', note: SAMPLE_NOTE },
  })
  promptIds[question.arena].push(Number(prompt.id))
  const answering = models.filter((model) => model.arenas.includes(question.arena))
  for (const [index, model] of answering.entries()) {
    const { intro, steps } = answerText[question.lang]
    const long = draw() < 0.5
    let image: number | undefined
    if (model.canvas) {
      // Stored the way the answer job stores a picture: a random name, nothing about the model.
      const png = await samplePicture(1000 * (questionIndex + 1) + index, model.canvas)
      const name = `${randomBytes(12).toString('hex')}.png`
      image = Number((await payload.create({ collection: 'arena-images', data: {}, file: { data: png, mimetype: 'image/png', name, size: png.byteLength }, depth: 0 })).id)
      pictures++
    }
    const answer = await payload.create({
      collection: 'arena-answers',
      data: {
        prompt: Number(prompt.id),
        model: modelIds.get(model) as number,
        arena: arenaIds[question.arena],
        lang: question.lang,
        status: 'done',
        ...(image
          ? { image }
          : { text: [intro(index + 1), long && steps, long && question.code].filter(Boolean).join('\n\n') }),
        costUsd: Number((model.costUsd * (0.8 + draw() * 0.4)).toFixed(6)),
        inputTokens: 60 + question.text.length,
        outputTokens: image ? 1290 : Math.round((long ? 500 : 200) + draw() * 300),
        generatedAt: now.toISOString(),
      },
    })
    answerIds.set(`${prompt.id}:${modelIds.get(model)}`, Number(answer.id))
  }
}

// Four weeks of votes; a period's models are those in the votes since its start.
const thisWeek = weekOf(shanghaiDate(now))
const notAfterNow = (date: Date) => (date < now ? date : now)
const periods = [
  { weeksAgo: 4, from: snapshotTime(addDays(thisWeek, -28)), until: notAfterNow(snapshotTime(addDays(thisWeek, -14))), votes: 1400 },
  { weeksAgo: 2, from: snapshotTime(addDays(thisWeek, -14)), until: notAfterNow(snapshotTime(addDays(thisWeek, -7))), votes: 500 },
  { weeksAgo: 1, from: snapshotTime(addDays(thisWeek, -7)), until: notAfterNow(snapshotTime(thisWeek)), votes: 1500 },
  { weeksAgo: 0, from: snapshotTime(thisWeek), until: now, votes: 300 },
]
const rows: (typeof arenaBattles.$inferInsert)[] = []
for (const [arenaIndex, [arena, scale]] of ([['text', 1], ['coding', 0.7], ['image', 0.6]] as const).entries()) {
  for (const [periodIndex, period] of periods.entries()) {
    if (period.until.getTime() - period.from.getTime() < 60_000) continue
    // Each period has its own sequence, so one cut short (run on a Monday morning) leaves the others as they were.
    const draw = random(100 * (arenaIndex + 1) + periodIndex)
    const outcomeOf = (a: SampleModel, b: SampleModel): Outcome => {
      const roll = draw()
      if (roll < 0.05) return 'bad'
      if (roll < 0.2) return 'tie'
      return draw() < 1 / (1 + 10 ** ((b.strength - a.strength) / 400)) ? 'a' : 'b'
    }
    const pool = models.filter((model) => model.arenas.includes(arena) && model.since >= period.weeksAgo)
    const total = pool.reduce((sum, model) => sum + (model.share ?? 1), 0)
    const pick = (other?: SampleModel): SampleModel => {
      let roll = draw() * total
      const model = pool.find((item) => (roll -= item.share ?? 1) <= 0) ?? pool[pool.length - 1]
      return model === other ? pick(other) : model
    }
    for (let count = 0; count < Math.round(period.votes * scale); count++) {
      const a = pick()
      const b = pick(a)
      const promptId = promptIds[arena][Math.floor(draw() * promptIds[arena].length)]
      const createdAt = new Date(period.from.getTime() + draw() * (period.until.getTime() - period.from.getTime() - 60_000))
      rows.push({
        id: randomBytes(18).toString('base64url'),
        arenaId: arenaIds[arena],
        promptId,
        modelAId: modelIds.get(a) as number,
        modelBId: modelIds.get(b) as number,
        answerAId: answerIds.get(`${promptId}:${modelIds.get(a)}`) as number,
        answerBId: answerIds.get(`${promptId}:${modelIds.get(b)}`) as number,
        userId: null,
        pageLocale: locales[Math.floor(draw() * locales.length)],
        createdAt,
        votedAt: new Date(createdAt.getTime() + 30_000),
        outcome: outcomeOf(a, b),
        counted: true,
      })
    }
  }
}
for (let start = 0; start < rows.length; start += 500) await db.insert(arenaBattles).values(rows.slice(start, start + 500))

// The Monday snapshots of the last three weeks, each from the votes before it.
for (const [arena, id] of Object.entries(arenaIds)) {
  for (const week of [addDays(thisWeek, -14), addDays(thisWeek, -7), thisWeek]) {
    const result = await storeSnapshot(id, week, { votedBefore: snapshotTime(week) })
    console.log(`${arena} ${week}:`, result.status === 'stored' ? `${result.ranked} of ${result.models} models placed, ${result.votes} votes` : result.reason)
  }
}
// Outside boards, made up, written the way the daily sync writes them.
const [stored] = await db.select({ days: count() }).from(externalSnapshots)
if (target === 'preview') {
  console.log('Outside boards: none made up on a preview; 「现在同步」 brings the real ones.')
} else if (Number(stored?.days ?? 0) === 0) {
  const today = shanghaiDate(now)
  /** Arena-style lines (maker keys, licenses, intervals, votes), placed by score. */
  const arenaRows = (names: [string, string, string][], top: number, drift: number): ExternalRow[] =>
    rankByScore(
      names.map(([model, org, license], index) => {
        const score = top - index * 9 + (index % 4 === 1 ? drift : 0)
        const interval = 4 + (index % 3)
        return { model, org, license, weights: weightsOf(license), score, lower: score - interval, upper: score + interval, votes: 9000 - index * 600 }
      }),
    )
  const textModels: [string, string, string][] = [
    ['Lumen 4', 'lumen-labs', 'Proprietary'],
    ['Atlas Pro 2', 'atlas-ai', 'Proprietary'],
    ['Kestrel 3', 'kestrel-ai', 'Apache 2.0'],
    ['Orchid Large', 'orchid', 'Proprietary'],
    ['Basalt 70B', 'basalt-research', 'Basalt Community License'],
    ['Lumen 4 Mini', 'lumen-labs', 'Proprietary'],
    ['Tundra 1.5', 'tundra', 'MIT'],
    ['Kestrel 3 Coder', 'kestrel-ai', 'Apache 2.0'],
    ['Atlas Flash', 'atlas-ai', 'Proprietary'],
    ['Fjord Nano', 'fjord', 'Proprietary'],
    ['Basalt 8B', 'basalt-research', 'Basalt Community License'],
    ['Orchid Small', 'orchid', 'Proprietary'],
  ]
  /** Artificial Analysis-style lines: names as it writes them, no licenses or votes; intervals only in its arenas. */
  const aaRows = (entries: [string, string, number, number | null][]): ExternalRow[] =>
    rankByScore(
      entries.map(([model, org, score, interval]) => ({
        model,
        org,
        license: null,
        weights: null,
        score,
        lower: interval === null ? null : score - interval,
        upper: interval === null ? null : score + interval,
        votes: null,
      })),
    )
  const boards: [ExternalSource, string, { publishedOn: string; rows: ExternalRow[] }[]][] = [
    ['arena', 'text', [95, 64, 33, 2].map((daysAgo, step) => ({ publishedOn: addDays(today, -daysAgo), rows: arenaRows(textModels, 1440 + step * 12, step * 6) }))],
    ['arena', 'webdev', [{ publishedOn: addDays(today, -2), rows: arenaRows(textModels.slice(0, 6), 1380, 0) }]],
    [
      'artificial-analysis',
      'intelligence',
      [
        {
          publishedOn: addDays(today, -1),
          rows: aaRows([
            ['Lumen 4 (high)', 'Lumen Labs', 71.4, null],
            ['Atlas Pro 2', 'Atlas AI', 68.9, null],
            ['Kestrel 3', 'Kestrel AI', 64.2, null],
            ['Orchid Large', 'Orchid', 58.7, null],
            ['Basalt 70B', 'Basalt Research', 52.3, null],
            ['Tundra 1.5', 'Tundra', 47.8, null],
          ]),
        },
      ],
    ],
    [
      'artificial-analysis',
      'text-to-speech',
      [
        {
          publishedOn: addDays(today, -1),
          rows: aaRows([
            ['Lumen Voice', 'Lumen Labs', 1218, 14],
            ['Kestrel Speak', 'Kestrel AI', 1196, 18],
            ['Orchid Read', 'Orchid', 1150, 22],
          ]),
        },
      ],
    ],
  ]
  for (const [source, board, days] of boards) {
    const result = await storeSnapshots(source, board, days)
    console.log(`${source}/${board}: ${result.added} days added, newest ${result.latest}`)
  }
} else {
  console.log('Outside boards: this database already has some, left as they are.')
}

console.log(`Sample rankings: ${models.length} models, ${questions.length} questions, ${answerIds.size} answers (${pictures} pictures), ${rows.length} votes.`)
process.exit(0)
