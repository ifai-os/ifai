import { isNull, lte, or } from '@payloadcms/db-postgres/drizzle'

import { getDb } from '@/lib/db/drizzle'

import type { ResendQuota } from './delivery'
import { resendState } from './schema'

/** The one row of `resend_state`: what the subscriber list shows of Resend's quota and its last refusal. */
const ROW = 1

export type ResendStateRow = typeof resendState.$inferSelect

/** The quota headers of a send, unless a later reading is already stored. */
export async function recordQuota(quota: ResendQuota | null, at: Date): Promise<void> {
  if (!quota) return
  const { db } = await getDb()
  await db
    .insert(resendState)
    .values({ id: ROW, dailyUsed: quota.daily, monthlyUsed: quota.monthly, readAt: at })
    .onConflictDoUpdate({
      target: resendState.id,
      set: { dailyUsed: quota.daily, monthlyUsed: quota.monthly, readAt: at },
      setWhere: or(isNull(resendState.readAt), lte(resendState.readAt, at)),
    })
}

/** Why the last send failed, for「最近一次失败的原因」. */
export async function recordFailure(message: string, at: Date): Promise<void> {
  const { db } = await getDb()
  const lastError = message.slice(0, 1000)
  await db
    .insert(resendState)
    .values({ id: ROW, lastError, lastErrorAt: at })
    .onConflictDoUpdate({ target: resendState.id, set: { lastError, lastErrorAt: at } })
}

export async function readResendState(): Promise<ResendStateRow | null> {
  const { db } = await getDb()
  const [row] = await db.select().from(resendState).limit(1)
  return row ?? null
}
