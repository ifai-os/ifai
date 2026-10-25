import { randomBytes } from 'node:crypto'

import { and, desc, eq, gte, isNotNull, isNull, or, sql, type SQL } from '@payloadcms/db-postgres/drizzle'

import type { Locale } from '@/i18n/config'
import { getDb } from '@/lib/db/drizzle'
import { toHant } from '@/lib/i18n/hant'
import { shanghaiDayStart } from '@/lib/shanghai-day'

import { getArenas } from './data'
import {
  DAILY_BATTLES,
  DAILY_VOTES,
  isCountedVote,
  isOpenBattle,
  promptLangFor,
  RECENT_PROMPTS,
  type Outcome,
  type PromptLang,
} from './rules'
import { arenaBattles } from './schema'

/**
 * The blind vote (docs/specs/rankings.md rule 7): a question of the arena with two stored answers
 * from competing models in random order, then the member's vote and who wrote which. Nothing here
 * calls a model.
 */

/**
 * An answer a vote can show: done, with its text or its picture (one the site owner deleted is
 * gone), not hidden, not cut off, not naming itself, from a competing model of the arena.
 */
const usableAnswer = sql`a.status = 'done' and not coalesce(a.hidden, false) and not coalesce(a.cut_off, false)
  and not coalesce(a.names_itself, false) and (a.image_id is not null or coalesce(a.text, '') <> '')
  and m.status = 'active'
  and exists (select 1 from arena_models_rels r where r.parent_id = m.id and r.path = 'arenas' and r.arenas_id = p.arena_id)`

const answersOf = sql`arena_answers a
  join arena_prompts p on p.id = a.prompt_id and p.status = 'active'
  join arena_models m on m.id = a.model_id`

/** A random question in use of the arena in `lang` with at least two usable answers, outside `exclude`. */
async function pickPrompt(arenaId: number, lang: PromptLang, exclude: number[]): Promise<number | null> {
  const { db } = await getDb()
  const outside: SQL = exclude.length ? sql`and a.prompt_id not in (${sql.join(exclude.map((id) => sql`${id}`), sql`, `)})` : sql``
  const result = await db.execute<{ prompt_id: number }>(sql`
    select a.prompt_id from ${answersOf}
    where p.arena_id = ${arenaId} and p.lang = ${lang} and ${usableAnswer} ${outside}
    group by a.prompt_id having count(*) >= 2
    order by random() limit 1`)
  return result.rows[0] ? Number(result.rows[0].prompt_id) : null
}

/** The page language's questions, else English (rule 5); a question the member voted on lately only when there is no other. */
async function choosePrompt(arenaId: number, locale: Locale, recent: number[]): Promise<number | null> {
  const langs = [...new Set([promptLangFor(locale), 'en' as const])]
  for (const lang of langs) {
    const prompt = (await pickPrompt(arenaId, lang, recent)) ?? (recent.length ? await pickPrompt(arenaId, lang, []) : null)
    if (prompt) return prompt
  }
  return null
}

type Today = { votes: number; opened: number }

/** The member's votes and opened questions today (Shanghai day). */
async function memberToday(userId: string, now: Date): Promise<Today> {
  const { db } = await getDb()
  const since = shanghaiDayStart(now)
  const [row] = await db
    .select({
      votes: sql<number>`(count(*) filter (where ${arenaBattles.votedAt} >= ${since}))::int`,
      opened: sql<number>`(count(*) filter (where ${arenaBattles.createdAt} >= ${since}))::int`,
    })
    .from(arenaBattles)
    .where(and(eq(arenaBattles.userId, userId), or(gte(arenaBattles.createdAt, since), gte(arenaBattles.votedAt, since))))
  return { votes: Number(row?.votes ?? 0), opened: Number(row?.opened ?? 0) }
}

/** The questions the member voted on most recently. */
async function recentPrompts(userId: string): Promise<number[]> {
  const { db } = await getDb()
  const rows = await db
    .select({ promptId: arenaBattles.promptId })
    .from(arenaBattles)
    .where(and(eq(arenaBattles.userId, userId), isNotNull(arenaBattles.votedAt)))
    .orderBy(desc(arenaBattles.votedAt))
    .limit(RECENT_PROMPTS)
  return [...new Set(rows.map((row) => row.promptId))]
}

/** Text in the page's script: Traditional Chinese pages show Simplified questions and answers converted (rule 5). */
function forPage(text: string, lang: PromptLang, locale: Locale): { text: string; lang: string } {
  return locale === 'zh-Hant' && lang === 'zh-Hans' ? { text: toHant(text), lang: 'zh-Hant' } : { text, lang }
}

/** A picture as a vote shows it: the copy sized for the page, its size, and the file the model returned. */
export type BattleImage = { src: string; width: number; height: number; original: string }

/** One side of a vote: a text answer in the page's script, or a picture (「图像生成赛道」). */
export type BattleAnswer = { kind: 'text'; text: string; lang: string } | { kind: 'image'; image: BattleImage }

export type Battle = {
  /** What the vote names; null for visitors, whose questions are not stored. */
  id: string | null
  arena: string
  prompt: { text: string; lang: string }
  /** A, then B. */
  answers: [BattleAnswer, BattleAnswer]
}

export type OpenResult = { status: 'ready'; battle: Battle } | { status: 'not-found' } | { status: 'empty' } | { status: 'daily-limit' }

/**
 * A question for the vote page: the arena by slug (the first published one without), a question
 * in the page's language and two usable answers from different competing models, A and B at
 * random. For members it is stored, so their vote can name it; visitors see the same without a
 * record, and sign in to vote.
 */
export async function openBattle({
  arena: slug,
  locale,
  userId,
  now = new Date(),
}: {
  arena: string | null
  locale: Locale
  userId: string | null
  now?: Date
}): Promise<OpenResult> {
  const arenas = await getArenas(locale)
  const arena = slug ? arenas.find((item) => item.slug === slug) : arenas[0]
  if (!arena) return { status: 'not-found' }

  if (userId) {
    const today = await memberToday(userId, now)
    if (today.votes >= DAILY_VOTES || today.opened >= DAILY_BATTLES) return { status: 'daily-limit' }
  }
  const recent = userId ? await recentPrompts(userId) : []
  const { db } = await getDb()
  // The answers can change between choosing the question and reading them (hidden meanwhile): then once more.
  for (let attempt = 0; attempt < 2; attempt++) {
    const promptId = await choosePrompt(arena.id, locale, recent)
    if (!promptId) return { status: 'empty' }
    const picked = await db.execute<PickedAnswer>(sql`
      select a.id, a.model_id, a.text, a.image_id, p.lang::text as lang, p.text as prompt from ${answersOf}
      where a.prompt_id = ${promptId} and ${usableAnswer}
      order by random() limit 2`)
    const [a, b] = picked.rows
    if (!a || !b) continue
    const answers = await shownAnswers([a, b], locale)
    if (answers) return { status: 'ready', battle: await storeBattle({ arena, promptId, a, b, answers, userId, locale, now }) }
  }
  return { status: 'empty' }
}

type PickedAnswer = { id: number; model_id: number; text: string | null; image_id: number | null; lang: PromptLang; prompt: string }

/** The two answers as the page shows them; null when a picture is gone by now. */
async function shownAnswers(picked: [PickedAnswer, PickedAnswer], locale: Locale): Promise<[BattleAnswer, BattleAnswer] | null> {
  const imageIds = picked.map((answer) => answer.image_id).filter((id): id is number => id !== null)
  const images = new Map<number, BattleImage>()
  if (imageIds.length) {
    const { payload } = await getDb()
    // Whole documents: the addresses are worked out from the file names (and, on R2, the folder).
    const { docs } = await payload.find({ collection: 'arena-images', where: { id: { in: imageIds } }, depth: 0, joins: false, pagination: false })
    for (const doc of docs) {
      if (!doc.url) continue
      const shown = doc.sizes?.vote?.url ? doc.sizes.vote : doc
      images.set(Number(doc.id), { src: shown.url ?? doc.url, width: shown.width ?? 1024, height: shown.height ?? 1024, original: doc.url })
    }
  }
  const [a, b] = picked.map((answer): BattleAnswer | null => {
    if (answer.image_id === null) return { kind: 'text', ...forPage(answer.text ?? '', answer.lang, locale) }
    const image = images.get(Number(answer.image_id))
    return image ? { kind: 'image', image } : null
  })
  return a && b ? [a, b] : null
}

/** Stores a member's question (visitors' are not stored) and returns it in the page's script. */
async function storeBattle({
  arena,
  promptId,
  a,
  b,
  answers,
  userId,
  locale,
  now,
}: {
  arena: { id: number; slug: string }
  promptId: number
  a: PickedAnswer
  b: PickedAnswer
  answers: [BattleAnswer, BattleAnswer]
  userId: string | null
  locale: Locale
  now: Date
}): Promise<Battle> {
  const { db } = await getDb()
  let id: string | null = null
  if (userId) {
    id = randomBytes(18).toString('base64url')
    await db.insert(arenaBattles).values({
      id,
      arenaId: arena.id,
      promptId,
      modelAId: Number(a.model_id),
      modelBId: Number(b.model_id),
      answerAId: Number(a.id),
      answerBId: Number(b.id),
      userId,
      pageLocale: locale,
      createdAt: now,
    })
  }
  return { id, arena: arena.slug, prompt: forPage(a.prompt, a.lang, locale), answers }
}

export type RevealedModel = { name: string; org: string }

export type VoteResult =
  | { status: 'voted'; counted: boolean; models: { a: RevealedModel; b: RevealedModel } }
  | { status: 'not-found' | 'voted-already' | 'expired' | 'daily-limit' }

/**
 * The member's vote on a question they were shown: once, within two hours, at most 200 a day.
 * A vote cast within four seconds of the question appearing is kept but not counted. Answers who
 * wrote A and who wrote B.
 */
export async function castVote({
  id,
  userId,
  outcome,
  locale,
  now = new Date(),
}: {
  id: string
  userId: string
  outcome: Outcome
  locale: Locale
  now?: Date
}): Promise<VoteResult> {
  const { payload, db } = await getDb()
  const [battle] = await db
    .select({ createdAt: arenaBattles.createdAt, votedAt: arenaBattles.votedAt, modelAId: arenaBattles.modelAId, modelBId: arenaBattles.modelBId })
    .from(arenaBattles)
    .where(and(eq(arenaBattles.id, id), eq(arenaBattles.userId, userId)))
    .limit(1)
  if (!battle) return { status: 'not-found' }
  if (battle.votedAt) return { status: 'voted-already' }
  if (!isOpenBattle(battle.createdAt, now)) return { status: 'expired' }
  if ((await memberToday(userId, now)).votes >= DAILY_VOTES) return { status: 'daily-limit' }

  const counted = isCountedVote(battle.createdAt, now)
  const updated = await db
    .update(arenaBattles)
    .set({ votedAt: now, outcome, counted })
    .where(and(eq(arenaBattles.id, id), isNull(arenaBattles.votedAt)))
    .returning({ id: arenaBattles.id })
  if (!updated.length) return { status: 'voted-already' }

  const { docs } = await payload.find({
    collection: 'arena-models',
    where: { id: { in: [battle.modelAId, battle.modelBId] } },
    locale,
    pagination: false,
    depth: 0,
    select: { name: true, org: true },
  })
  const reveal = (modelId: number): RevealedModel => {
    const model = docs.find((doc) => Number(doc.id) === modelId)
    return { name: model?.name ?? '—', org: model?.org ?? '' }
  }
  return { status: 'voted', counted, models: { a: reveal(battle.modelAId), b: reveal(battle.modelBId) } }
}
