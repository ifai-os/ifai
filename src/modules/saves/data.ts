import { and, count, desc, eq, gte, lt } from '@payloadcms/db-postgres/drizzle'

import { getDb } from '@/lib/db/drizzle'

import { saves } from './schema'
import type { SaveTarget, SaveType } from './target'

/** What a page shows on its save button. */
export type SaveState = { saved: boolean; count: number }

const onTarget = ({ type, id }: SaveTarget) => and(eq(saves.targetType, type), eq(saves.targetId, id))

/** How many members have the target saved, and whether `userId` (null for a visitor) is one of them. */
export async function saveState(target: SaveTarget, userId: string | null): Promise<SaveState> {
  const { db } = await getDb()
  const [[total], mine] = await Promise.all([
    db.select({ count: count() }).from(saves).where(onTarget(target)),
    userId
      ? db
          .select({ id: saves.id })
          .from(saves)
          .where(and(onTarget(target), eq(saves.userId, userId)))
          .limit(1)
      : Promise.resolve([]),
  ])
  return { saved: mine.length > 0, count: Number(total?.count ?? 0) }
}

/** Saves or unsaves the target for the member. Saving again keeps the first save and its time. */
export async function setSaved(target: SaveTarget, userId: string, saved: boolean): Promise<SaveState> {
  const { db } = await getDb()
  if (saved) {
    await db
      .insert(saves)
      .values({ userId, targetType: target.type, targetId: target.id })
      .onConflictDoNothing({ target: [saves.userId, saves.targetType, saves.targetId] })
  } else {
    await db.delete(saves).where(and(onTarget(target), eq(saves.userId, userId)))
  }
  return saveState(target, userId)
}

/** The member's saves of one type, newest first. */
export async function savedIds(userId: string, type: SaveType): Promise<number[]> {
  const { db } = await getDb()
  const rows = await db
    .select({ id: saves.targetId })
    .from(saves)
    .where(and(eq(saves.userId, userId), eq(saves.targetType, type)))
    .orderBy(desc(saves.createdAt), desc(saves.id))
  return rows.map((row) => row.id)
}

/** How many members have each target of a type saved now: what the Skills stats roll-up keeps. */
export async function saveCounts(type: SaveType): Promise<Map<number, number>> {
  const { db } = await getDb()
  const rows = await db
    .select({ id: saves.targetId, count: count() })
    .from(saves)
    .where(eq(saves.targetType, type))
    .groupBy(saves.targetId)
  return new Map(rows.map((row) => [row.id, Number(row.count)]))
}

/** New saves per target made in [from, to) and still saved: what the apps heat counts. */
export async function newSaveCounts(type: SaveType, from: Date, to: Date): Promise<Map<number, number>> {
  const { db } = await getDb()
  const rows = await db
    .select({ id: saves.targetId, count: count() })
    .from(saves)
    .where(and(eq(saves.targetType, type), gte(saves.createdAt, from), lt(saves.createdAt, to)))
    .groupBy(saves.targetId)
  return new Map(rows.map((row) => [row.id, Number(row.count)]))
}

/** Whether visitors can see the target, which is what saving it needs: a published app, Skill or story. */
const visible: Record<SaveType, (id: number) => Promise<boolean>> = {
  app: async (id) => {
    const { payload } = await getDb()
    const { totalDocs } = await payload.count({ collection: 'apps', where: { id: { equals: id } }, overrideAccess: false })
    return totalDocs > 0
  },
  // Visitors read published Skills only, so a delisted one cannot be saved.
  skill: async (id) => {
    const { payload } = await getDb()
    const { totalDocs } = await payload.count({ collection: 'skills', where: { id: { equals: id } }, overrideAccess: false })
    return totalDocs > 0
  },
  // Withdrawn, merged and unpublished stories cannot be saved.
  story: async (id) => {
    const { payload } = await getDb()
    const { totalDocs } = await payload.count({
      collection: 'stories',
      where: { and: [{ id: { equals: id } }, { status: { equals: 'published' } }] },
      overrideAccess: false,
    })
    return totalDocs > 0
  },
}

export function isSaveable(target: SaveTarget): Promise<boolean> {
  return visible[target.type](target.id)
}
