import { getDb } from '@/lib/db/drizzle'
import { shanghaiDate } from '@/lib/shanghai-day'
import { visitorHash } from '@/lib/visitor'

import { skillEvents, type installEventTypes } from '../db/schema'

export type InstallEvent = {
  skillId: number
  versionId: number
  type: (typeof installEventTypes)[number]
  /** The host picked in the install panel or named in install.md's address; null when unknown. */
  host: string | null
}

export type Visit = { ip: string; userAgent: string; secret: string; now?: Date }

/**
 * One install (docs/specs/resources.md, rule 14): copying the instruction, downloading the Zip or
 * fetching install.md. The same visitor counts once per Skill and Shanghai day, whatever they did
 * (the unique index on skill, visitor and day); the hourly roll-up turns rows into the counts.
 */
export async function recordInstall(event: InstallEvent, visit: Visit): Promise<void> {
  const day = shanghaiDate(visit.now)
  const { db } = await getDb()
  await db
    .insert(skillEvents)
    .values({
      skillId: event.skillId,
      versionId: event.versionId,
      type: event.type,
      hostSlug: event.host,
      day,
      visitorHash: visitorHash({ ip: visit.ip, userAgent: visit.userAgent, day, secret: visit.secret }),
    })
    .onConflictDoNothing()
}

/** A host slug from a query string or a request body: lower-case letters, digits and dashes only. */
export function readHost(value: unknown): string | null {
  return typeof value === 'string' && /^[a-z0-9-]{1,40}$/.test(value) ? value : null
}
