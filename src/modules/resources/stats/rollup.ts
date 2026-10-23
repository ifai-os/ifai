import { count, sql } from '@payloadcms/db-postgres/drizzle'

import { getDb } from '@/lib/db/drizzle'
import { saveCounts } from '@/modules/saves/data'

import { skillEvents } from '../db/schema'
import { refreshSkillsCache } from '../public/cache'

/** What `skills.stats` holds (docs/specs/resources.md「数据」). */
export type SkillStats = { installs: number; installs7d: number; installsPrev7d: number; saves: number }

const weekMs = 7 * 24 * 60 * 60 * 1000

/** The two windows the roll-up counts: the seven days up to `now`, and the seven days before them. */
export function statsWindows(now: Date): { weekStart: Date; prevStart: Date } {
  return { weekStart: new Date(now.getTime() - weekMs), prevStart: new Date(now.getTime() - 2 * weekMs) }
}

/** Whether the stored numbers differ from the new ones; a missing number counts as 0. */
export function statsChanged(stored: Partial<Record<keyof SkillStats, number | null>> | null | undefined, next: SkillStats): boolean {
  return (Object.keys(next) as (keyof SkillStats)[]).some((key) => (stored?.[key] ?? 0) !== next[key])
}

/**
 * Counts every Skill's installs (all time, the last 7 days, the 7 days before) from
 * `skill_events`, and its saves, and writes the ones that changed into `skills.stats`. The write
 * goes through the database adapter: no hooks, no entry in the Skill's history, and its update
 * time stays. The Skills pages are refreshed once at the end when anything changed.
 */
export async function rollUpSkillStats(now: Date = new Date()): Promise<{ skills: number; changed: number }> {
  const { payload, db } = await getDb()
  const { weekStart, prevStart } = statsWindows(now)
  const [events, saved, skills] = await Promise.all([
    db
      .select({
        skillId: skillEvents.skillId,
        installs: count(),
        installs7d: sql<number>`count(*) filter (where ${skillEvents.createdAt} >= ${weekStart})`.mapWith(Number),
        installsPrev7d: sql<number>`count(*) filter (where ${skillEvents.createdAt} >= ${prevStart} and ${skillEvents.createdAt} < ${weekStart})`.mapWith(
          Number,
        ),
      })
      .from(skillEvents)
      .groupBy(skillEvents.skillId),
    saveCounts('skill'),
    payload.find({ collection: 'skills', pagination: false, depth: 0, select: { stats: true } }),
  ])

  const counted = new Map(events.map((row) => [row.skillId, row]))
  let changed = 0
  for (const skill of skills.docs) {
    const row = counted.get(skill.id)
    const next: SkillStats = {
      installs: row?.installs ?? 0,
      installs7d: row?.installs7d ?? 0,
      installsPrev7d: row?.installsPrev7d ?? 0,
      saves: saved.get(skill.id) ?? 0,
    }
    if (!statsChanged(skill.stats, next)) continue
    // updatedAt: null tells the adapter to leave the update time alone: new numbers are not an edit.
    await payload.db.updateOne({ collection: 'skills', id: skill.id, data: { stats: next, updatedAt: null }, returning: false })
    changed++
  }
  if (changed > 0) refreshSkillsCache()
  return { skills: skills.docs.length, changed }
}
