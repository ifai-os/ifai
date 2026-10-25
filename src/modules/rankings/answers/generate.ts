import config from '@payload-config'
import type { PostgresAdapter } from '@payloadcms/db-postgres'
import { and, eq, gte, sql } from '@payloadcms/db-postgres/drizzle'
import { getPayload, type Payload } from 'payload'

import { ai as defaultAi } from '@/lib/ai'
import type { Ai } from '@/lib/ai/client'
import { ModelCallError, ReceiptExhaustedError } from '@/lib/ai/errors'
import { modelReceipts } from '@/lib/ai/schema'
import { shanghaiDayStart } from '@/lib/shanghai-day'

import { answerInstructions } from '../prompts/answer'
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

/**
 * One answer: the model gets the arena instructions and the question as written, at most
 * ANSWER_MAX_TOKENS; the answer is stored with its cost and whether it can be shown in a vote
 * (not cut off, not naming its model or maker). Retries are new calls (`attempts` is the variant),
 * so「重新生成」pays again on purpose.
 */
export async function generateAnswer(answerId: number, deps: AnswerDeps = {}): Promise<Generated> {
  const payload = await payloadOf(deps)
  const answer = await payload.findByID({ collection: 'arena-answers', id: answerId, depth: 0 }).catch(() => null)
  if (!answer || answer.status !== 'pending') return { status: 'skipped', reason: 'not waiting any more' }
  const [prompt, model] = await Promise.all([
    payload.findByID({ collection: 'arena-prompts', id: Number(answer.prompt), depth: 0 }).catch(() => null),
    payload.findByID({ collection: 'arena-models', id: Number(answer.model), depth: 0, locale: 'all' }).catch(() => null),
  ])
  if (!prompt || prompt.status !== 'active') return { status: 'skipped', reason: 'the question is not in use' }
  if (!model || (model.status !== 'draft' && model.status !== 'active')) return { status: 'skipped', reason: 'the model is retired' }

  const spent = await arenaBudgetUsedUp(deps)
  if (spent) return { status: 'paused', reason: `ARENA_DAILY_BUDGET_USD used up: $${spent.spentUsd.toFixed(4)} of $${spent.budgetUsd.toFixed(2)}` }

  const attempts = Number(answer.attempts ?? 0)
  try {
    const { output, receiptId, reused } = await (deps.ai ?? defaultAi).contest({
      purpose: 'arena',
      model: model.openrouterId,
      instructions: answerInstructions,
      prompt: prompt.text,
      variant: attempts > 0 ? `retry-${attempts}` : undefined,
      subject: `arena-answers:${answerId}`,
      maxOutputTokens: ANSWER_MAX_TOKENS,
    })
    const text = output.text.trim()
    if (!text) return fail(payload, answerId, 'The model returned an empty answer.')
    const [usage] = await drizzleOf(payload)
      .select({ costUsd: modelReceipts.costUsd, inputTokens: modelReceipts.inputTokens, outputTokens: modelReceipts.outputTokens })
      .from(modelReceipts)
      .where(eq(modelReceipts.id, receiptId))
      .limit(1)
    const names = namesItself(text, { name: model.name, org: spellings(model.org as Localized) })
    await payload.update({
      collection: 'arena-answers',
      id: answerId,
      depth: 0,
      data: {
        status: 'done',
        text,
        cutOff: output.cutOff,
        namesItself: names,
        costUsd: usage?.costUsd ?? null,
        inputTokens: usage?.inputTokens ?? null,
        outputTokens: usage?.outputTokens ?? null,
        generatedAt: nowOf(deps).toISOString(),
        error: null,
      },
    })
    return { status: 'done', cutOff: output.cutOff, namesItself: names, costUsd: usage?.costUsd ?? 0, reused }
  } catch (error) {
    if (error instanceof ReceiptExhaustedError) return fail(payload, answerId, error.message)
    if (error instanceof ModelCallError) {
      return error.retryable ? { status: 'skipped', reason: error.message } : { status: 'paused', reason: error.message }
    }
    // The provider refused or broke off; the receipt counted the attempt. Shown in the back office meanwhile.
    await payload.update({ collection: 'arena-answers', id: answerId, depth: 0, data: { error: message(error).slice(0, 500) } })
    return { status: 'error', reason: message(error) }
  }
}

async function fail(payload: Payload, answerId: number, reason: string): Promise<Generated> {
  await payload.update({ collection: 'arena-answers', id: answerId, depth: 0, data: { status: 'failed', error: reason.slice(0, 500) } })
  return { status: 'failed', reason }
}
