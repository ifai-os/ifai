import type { PostgresAdapter } from '@payloadcms/db-postgres'
import { desc, inArray, sql } from '@payloadcms/db-postgres/drizzle'
import type { Payload } from 'payload'

import { arenaBattles, arenaSnapshotRows, arenaSnapshots } from './schema'

/**
 * What the back office reads and changes in the rankings (docs/specs/rankings.md「后台」). This
 * file stays free of the Payload config, so the collections (through ./endpoints) can import it;
 * it works on the Payload instance the request already has.
 */

const drizzleOf = (payload: Payload) => (payload.db as unknown as PostgresAdapter).drizzle

export type AdminLocale = 'zh-Hans' | 'en'

export type SnapshotStatusRow = {
  arenaId: number
  name: string
  published: boolean
  /** The latest snapshot: its week (Monday), when it was computed, its votes and models; null before the first. */
  latest: { week: string; computedAt: string; votes: number; models: number } | null
  /** Counted votes now, for the next snapshot. */
  votesNow: number
}

/** Every arena with its latest snapshot and how many counted votes it has now. */
export async function snapshotStatus(payload: Payload, locale: AdminLocale): Promise<SnapshotStatusRow[]> {
  const db = drizzleOf(payload)
  const [{ docs: arenas }, latest, votes] = await Promise.all([
    payload.find({ collection: 'arenas', pagination: false, depth: 0, locale, sort: 'order', select: { name: true, status: true } }),
    db
      .selectDistinctOn([arenaSnapshots.arenaId], {
        id: arenaSnapshots.id,
        arenaId: arenaSnapshots.arenaId,
        week: arenaSnapshots.week,
        computedAt: arenaSnapshots.computedAt,
        votes: arenaSnapshots.votes,
      })
      .from(arenaSnapshots)
      .orderBy(arenaSnapshots.arenaId, desc(arenaSnapshots.week)),
    db
      .select({ arenaId: arenaBattles.arenaId, votes: sql<number>`count(*)::int` })
      .from(arenaBattles)
      .where(sql`${arenaBattles.counted}`)
      .groupBy(arenaBattles.arenaId),
  ])
  const models = latest.length
    ? await db
        .select({ snapshotId: arenaSnapshotRows.snapshotId, models: sql<number>`count(*)::int` })
        .from(arenaSnapshotRows)
        .where(inArray(arenaSnapshotRows.snapshotId, latest.map((row) => row.id)))
        .groupBy(arenaSnapshotRows.snapshotId)
    : []
  const latestByArena = new Map(latest.map((row) => [row.arenaId, row]))
  const modelsBySnapshot = new Map(models.map((row) => [row.snapshotId, row.models]))
  const votesByArena = new Map(votes.map((row) => [row.arenaId, row.votes]))
  return arenas.map((arena) => {
    const snapshot = latestByArena.get(Number(arena.id))
    return {
      arenaId: Number(arena.id),
      name: arena.name ?? '',
      published: arena.status === 'published',
      latest: snapshot
        ? { week: snapshot.week, computedAt: snapshot.computedAt.toISOString(), votes: snapshot.votes, models: modelsBySnapshot.get(snapshot.id) ?? 0 }
        : null,
      votesNow: votesByArena.get(Number(arena.id)) ?? 0,
    }
  })
}

export type AnswerProgress = {
  arenaId: number
  name: string
  /** Questions in use in the arena: the answers this model should have. */
  questions: number
  done: number
  /** Done but never shown in votes: hidden, cut off, naming itself, or its picture deleted. */
  unusable: number
  pending: number
  failed: number
  costUsd: number
}

type ProgressRow = { arena_id: number; status: string; answers: number; unusable: number; cost: number }

/** A done answer with nothing left to show: its picture was deleted in the back office. */
const lost = sql`(image_id is null and coalesce(text, '') = '')`

/** A contestant's answers per arena it is in (the「回答」box on its page). */
export async function answerProgress(payload: Payload, modelId: number, locale: AdminLocale): Promise<AnswerProgress[]> {
  const model = await payload.findByID({ collection: 'arena-models', id: modelId, depth: 0, select: { arenas: true } }).catch(() => null)
  const arenaIds = (model?.arenas ?? []).map((arena) => Number(typeof arena === 'object' ? arena.id : arena))
  if (arenaIds.length === 0) return []
  const db = drizzleOf(payload)
  const [{ docs: arenas }, answers, questions] = await Promise.all([
    payload.find({ collection: 'arenas', where: { id: { in: arenaIds } }, pagination: false, depth: 0, locale, sort: 'order', select: { name: true } }),
    db.execute<ProgressRow>(sql`
      select arena_id, status::text as status, count(*)::int as answers,
        (count(*) filter (where hidden or cut_off or names_itself or ${lost}))::int as unusable,
        coalesce(sum(cost_usd), 0)::float as cost
      from arena_answers where model_id = ${modelId}
      group by arena_id, status`),
    db.execute<{ arena_id: number; questions: number }>(sql`
      select arena_id, count(*)::int as questions from arena_prompts
      where status = 'active' and arena_id in (${sql.join(arenaIds.map((id) => sql`${id}`), sql`, `)})
      group by arena_id`),
  ])
  const questionsByArena = new Map(questions.rows.map((row) => [Number(row.arena_id), row.questions]))
  return arenas.map((arena) => {
    const rows = answers.rows.filter((row) => Number(row.arena_id) === Number(arena.id))
    const count = (status: string) => rows.filter((row) => row.status === status).reduce((sum, row) => sum + row.answers, 0)
    return {
      arenaId: Number(arena.id),
      name: arena.name ?? '',
      questions: questionsByArena.get(Number(arena.id)) ?? 0,
      done: count('done'),
      unusable: rows.filter((row) => row.status === 'done').reduce((sum, row) => sum + row.unusable, 0),
      pending: count('pending'),
      failed: count('failed'),
      costUsd: rows.reduce((sum, row) => sum + Number(row.cost), 0),
    }
  })
}

/**
 * 「重新生成失败和不能用的」: the model's failed answers, and its done ones that a vote cannot show
 * because they were cut off, name the model or lost their picture (not the ones the owner hid), go
 * back to waiting.
 * Each comes back as a new call (`attempts` + 1 is the call's variant), so a call that already
 * failed three times can be paid for again. Returns how many.
 */
export async function retryAnswers(payload: Payload, modelId: number): Promise<number> {
  const result = await drizzleOf(payload).execute<{ id: number }>(sql`
    update arena_answers
    set status = 'pending', error = null, attempts = coalesce(attempts, 0) + 1, updated_at = now()
    where model_id = ${modelId} and not hidden and (status = 'failed' or (status = 'done' and (cut_off or names_itself or ${lost})))
    returning id`)
  return result.rows.length
}
