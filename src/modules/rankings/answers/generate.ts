import { randomBytes } from 'node:crypto'

import config from '@payload-config'
import type { PostgresAdapter } from '@payloadcms/db-postgres'
import { and, eq, gte, sql } from '@payloadcms/db-postgres/drizzle'
import { getPayload, type Payload } from 'payload'

import { ai as defaultAi } from '@/lib/ai'
import type { Ai, ContestImage } from '@/lib/ai/client'
import { ModelCallError, ReceiptExhaustedError } from '@/lib/ai/errors'
import { modelReceipts } from '@/lib/ai/schema'
import { shanghaiDayStart } from '@/lib/shanghai-day'

import { answerInstructions, imageInstructions } from '../prompts/answer'
import { ANSWER_MAX_TOKENS, ANSWERS_PER_RUN, arenaBudgetUsd, namesItself } from '../rules'

/**
 * The answer job's steps (./jobs.ts, docs/specs/rankings.md「定时任务与 AI」): every question in
 * use gets one answer from each preparing or competing model of its arena, generated ahead of the
 * votes. Readers' votes never call a model.
 */

export type AnswerDeps = { ai?: Ai; payload?: Payload; now?: () => Date; env?: Record<string, string | undefined> }

const payloadOf = async (deps: AnswerDeps) => deps.payload ?? getPayload({ config })
const drizzleOf = (payload: Payload) => (payload.db as unknown as PostgresAdapter).drizzle
const nowOf = (deps: AnswerDeps) => deps.now?.() ?? new Date()
const message = (error: unknown) => (error instanceof Error ? error.message : String(error))

/** A model answers the questions of the arenas it is in, while it is 备赛 or 参赛. */
const answeringModel = sql`m.status in ('draft', 'active')
  and exists (select 1 from arena_models_rels r where r.parent_id = m.id and r.path = 'arenas' and r.arenas_id = p.arena_id)`

/**
 * A waiting answer for every (question in use, answering model of its arena) that has none yet.
 * Safe to run twice at once: the (question, model) pair is unique. Returns how many were added.
 */
export async function queueMissingAnswers(deps: AnswerDeps = {}): Promise<number> {
  const payload = await payloadOf(deps)
  const result = await drizzleOf(payload).execute<{ id: number }>(sql`
    insert into arena_answers (prompt_id, model_id, arena_id, lang, status, attempts, hidden, cut_off, names_itself)
    select p.id, m.id, p.arena_id, p.lang::text::enum_arena_answers_lang, 'pending'::enum_arena_answers_status, 0, false, false, false
    from arena_prompts p cross join arena_models m
    where p.status = 'active' and ${answeringModel}
    on conflict (prompt_id, model_id) do nothing
    returning id`)
  return result.rows.length
}

/** The next waiting answers still wanted (question in use, model answering in its arena), oldest first. */
export async function nextAnswers(limit: number = ANSWERS_PER_RUN, deps: AnswerDeps = {}): Promise<number[]> {
  const payload = await payloadOf(deps)
  const result = await drizzleOf(payload).execute<{ id: number }>(sql`
    select a.id from arena_answers a
    join arena_prompts p on p.id = a.prompt_id
    join arena_models m on m.id = a.model_id
    where a.status = 'pending' and p.status = 'active' and ${answeringModel}
    order by a.id
    limit ${limit}`)
  return result.rows.map((row) => Number(row.id))
}

/** What the answers cost today (Shanghai day), for ARENA_DAILY_BUDGET_USD (rule 13). */
export async function arenaSpentToday(deps: AnswerDeps = {}): Promise<number> {
  const payload = await payloadOf(deps)
  const [row] = await drizzleOf(payload)
    .select({ costUsd: sql<string>`coalesce(sum(${modelReceipts.costUsd}), 0)` })
    .from(modelReceipts)
    .where(and(eq(modelReceipts.purpose, 'arena'), gte(modelReceipts.completedAt, shanghaiDayStart(nowOf(deps)))))
  return Number(row?.costUsd ?? 0)
}

export type AnswerBudget = { spentUsd: number; budgetUsd: number }

/** Today's arena spend against its budget; `null` when there is room for another answer. */
export async function arenaBudgetUsedUp(deps: AnswerDeps = {}): Promise<AnswerBudget | null> {
  const spentUsd = await arenaSpentToday(deps)
  const budgetUsd = arenaBudgetUsd(deps.env)
  return spentUsd >= budgetUsd ? { spentUsd, budgetUsd } : null
}

export type Generated =
  | { status: 'done'; cutOff: boolean; namesItself: boolean; costUsd: number; reused: boolean }
  /** Not this answer's fault: switch off, a budget spent, no key. The run stops; the next one goes on. */
  | { status: 'paused'; reason: string }
  /** Left for the next run: no longer wanted, or the same call is running elsewhere. */
  | { status: 'skipped'; reason: string }
  /** The call failed; tried again next run until its receipt is out of attempts. */
  | { status: 'error'; reason: string }
  /** Failed three times, or empty: waits for「重新生成失败和不能用的」. */
  | { status: 'failed'; reason: string }

type Localized = string | Record<string, string | null | undefined> | null | undefined

/** Every language's spelling of a localized field read with `locale: 'all'`. */
function spellings(value: Localized): string[] {
  if (!value) return []
  if (typeof value === 'string') return [value]
  return Object.values(value).filter((text): text is string => Boolean(text))
}

type ArenaModel = { name: string; org?: unknown; openrouterId: string }

/** The call both kinds of answer share: one receipt per (question, model, retry). */
type Call = { purpose: 'arena'; model: string; prompt: string; variant: string | undefined; subject: string }

/**
 * One answer: the model gets the arena instructions and the question as written; a text answer is
 * stored with whether it can be shown in a vote (not cut off at ANSWER_MAX_TOKENS, not naming its
 * model or maker), a picture as soon as it arrives (「图像生成赛道」). Either way with its cost.
 * Retries are new calls (`attempts` is the variant), so「重新生成」pays again on purpose.
 */
export async function generateAnswer(answerId: number, deps: AnswerDeps = {}): Promise<Generated> {
  const payload = await payloadOf(deps)
  const answer = await payload.findByID({ collection: 'arena-answers', id: answerId, depth: 0 }).catch(() => null)
  if (!answer || answer.status !== 'pending') return { status: 'skipped', reason: 'not waiting any more' }
  const [prompt, model, arena] = await Promise.all([
    payload.findByID({ collection: 'arena-prompts', id: Number(answer.prompt), depth: 0 }).catch(() => null),
    payload.findByID({ collection: 'arena-models', id: Number(answer.model), depth: 0, locale: 'all' }).catch(() => null),
    payload.findByID({ collection: 'arenas', id: Number(answer.arena), depth: 0, select: { kind: true } }).catch(() => null),
  ])
  if (!prompt || prompt.status !== 'active') return { status: 'skipped', reason: 'the question is not in use' }
  if (!model || (model.status !== 'draft' && model.status !== 'active')) return { status: 'skipped', reason: 'the model is retired' }

  const spent = await arenaBudgetUsedUp(deps)
  if (spent) return { status: 'paused', reason: `ARENA_DAILY_BUDGET_USD used up: $${spent.spentUsd.toFixed(4)} of $${spent.budgetUsd.toFixed(2)}` }

  const attempts = Number(answer.attempts ?? 0)
  const call: Call = {
    purpose: 'arena',
    model: model.openrouterId,
    prompt: prompt.text,
    variant: attempts > 0 ? `retry-${attempts}` : undefined,
    subject: `arena-answers:${answerId}`,
  }
  try {
    return arena?.kind === 'image' ? await draw(payload, answerId, call, deps) : await write(payload, answerId, call, model, deps)
  } catch (error) {
    if (error instanceof ReceiptExhaustedError) return fail(payload, answerId, error.message)
    if (error instanceof ModelCallError) {
      return error.retryable ? { status: 'skipped', reason: error.message } : { status: 'paused', reason: error.message }
    }
    // The provider refused or broke off, or the picture could not be stored; the receipt counted
    // the attempt. Shown in the back office meanwhile.
    await payload.update({ collection: 'arena-answers', id: answerId, depth: 0, data: { error: message(error).slice(0, 500) } })
    return { status: 'error', reason: message(error) }
  }
}

/** A text answer, at most ANSWER_MAX_TOKENS (rule 6). */
async function write(payload: Payload, answerId: number, call: Call, model: ArenaModel, deps: AnswerDeps): Promise<Generated> {
  const { output, receiptId, reused } = await (deps.ai ?? defaultAi).contest({ ...call, instructions: answerInstructions, maxOutputTokens: ANSWER_MAX_TOKENS })
  const text = output.text.trim()
  if (!text) return fail(payload, answerId, 'The model returned an empty answer.')
  const usage = await usageOf(payload, receiptId)
  const names = namesItself(text, { name: model.name, org: spellings(model.org as Localized) })
  await payload.update({
    collection: 'arena-answers',
    id: answerId,
    depth: 0,
    data: { status: 'done', text, cutOff: output.cutOff, namesItself: names, ...usage, generatedAt: nowOf(deps).toISOString(), error: null },
  })
  return { status: 'done', cutOff: output.cutOff, namesItself: names, costUsd: usage.costUsd ?? 0, reused }
}

/**
 * A picture. It is never cut off, and what is drawn on it cannot be read for names: the site
 * owner looks at it in the back office and hides it if it gives the model away.
 */
async function draw(payload: Payload, answerId: number, call: Call, deps: AnswerDeps): Promise<Generated> {
  const { output, receiptId, reused } = await (deps.ai ?? defaultAi).contestImage({
    ...call,
    instructions: imageInstructions,
    keep: (picture) => keepPicture(payload, picture),
  })
  if (output.image === null) return fail(payload, answerId, 'The model returned no picture.')
  // A reused receipt points at the picture stored the first time, which the site owner may have deleted since.
  const stored = await payload.findByID({ collection: 'arena-images', id: output.image, depth: 0, joins: false, select: {} }).catch(() => null)
  if (!stored) return fail(payload, answerId, 'Its picture was deleted. Regenerate the answer for a new one.')
  const usage = await usageOf(payload, receiptId)
  await payload.update({
    collection: 'arena-answers',
    id: answerId,
    depth: 0,
    data: { status: 'done', image: output.image, text: null, cutOff: false, namesItself: false, ...usage, generatedAt: nowOf(deps).toISOString(), error: null },
  })
  return { status: 'done', cutOff: false, namesItself: false, costUsd: usage.costUsd ?? 0, reused }
}

const pictureExtensions: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }

/**
 * Into the pictures collection (../collections/ArenaImages.ts) under a random name: the address
 * says nothing about the model, the question or when it was drawn. Payload checks the bytes.
 */
async function keepPicture(payload: Payload, picture: ContestImage): Promise<number> {
  const name = `${randomBytes(12).toString('hex')}.${pictureExtensions[picture.mediaType] ?? 'png'}`
  const doc = await payload.create({
    collection: 'arena-images',
    data: {},
    file: { data: Buffer.from(picture.data), mimetype: picture.mediaType, name, size: picture.data.byteLength },
    depth: 0,
  })
  return Number(doc.id)
}

/** What the call cost, from its receipt. */
async function usageOf(payload: Payload, receiptId: number) {
  const [usage] = await drizzleOf(payload)
    .select({ costUsd: modelReceipts.costUsd, inputTokens: modelReceipts.inputTokens, outputTokens: modelReceipts.outputTokens })
    .from(modelReceipts)
    .where(eq(modelReceipts.id, receiptId))
    .limit(1)
  return { costUsd: usage?.costUsd ?? null, inputTokens: usage?.inputTokens ?? null, outputTokens: usage?.outputTokens ?? null }
}

async function fail(payload: Payload, answerId: number, reason: string): Promise<Generated> {
  await payload.update({ collection: 'arena-answers', id: answerId, depth: 0, data: { status: 'failed', error: reason.slice(0, 500) } })
  return { status: 'failed', reason }
}
