import { getDb } from '@/lib/db/drizzle'
import { shanghaiDate } from '@/lib/shanghai-day'
import { visitorHash } from '@/lib/visitor'

import { appClicks } from '../schema'

export type Visit = { ip: string; userAgent: string; secret: string; now?: Date }

/** Someone opened the app's website from its page: counted once per visitor, app and Shanghai day. */
export async function recordClick(appId: number, visit: Visit): Promise<void> {
  const day = shanghaiDate(visit.now)
  const { db } = await getDb()
  await db
    .insert(appClicks)
    .values({ appId, day, visitorHash: visitorHash({ ip: visit.ip, userAgent: visit.userAgent, day, secret: visit.secret }) })
    .onConflictDoNothing()
}
