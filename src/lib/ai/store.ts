import config from '@payload-config'
import type { PostgresAdapter } from '@payloadcms/db-postgres'
import { and, eq, gte, lt, or, sql } from '@payloadcms/db-postgres/drizzle'
import { getPayload } from 'payload'

import type { ReceiptStore } from './receipts'
import { modelReceipts as t } from './schema'

async function db() {
  const payload = await getPayload({ config })
  return (payload.db as unknown as PostgresAdapter).drizzle
}

const columns = {
  id: t.id,
  purpose: t.purpose,
  inputHash: t.inputHash,
  model: t.model,
  status: t.status,
  attempts: t.attempts,
  output: t.output,
  error: t.error,
}

/** Receipts in the `model_receipts` table, through Payload's Drizzle instance. */
export const postgresReceiptStore: ReceiptStore = {
  async find(purpose, inputHash) {
    const rows = await (await db())
      .select(columns)
      .from(t)
      .where(and(eq(t.purpose, purpose), eq(t.inputHash, inputHash)))
      .limit(1)
    return rows[0] ?? null
  },

  async claim(input, { staleBefore, maxAttempts }) {
    const now = new Date()
    // Insert, or take over a failed / abandoned receipt. When the row exists and the WHERE
    // does not match (running elsewhere, already done, out of attempts) nothing is returned.
    const rows = await (await db())
      .insert(t)
      .values({ ...input, status: 'pending', attempts: 1, createdAt: now, updatedAt: now })
      .onConflictDoUpdate({
        target: [t.purpose, t.inputHash],
        set: { status: 'pending', attempts: sql`${t.attempts} + 1`, error: null, updatedAt: now },
        setWhere: and(
          lt(t.attempts, maxAttempts),
          or(eq(t.status, 'failed'), and(eq(t.status, 'pending'), lt(t.updatedAt, staleBefore))),
        ),
      })
      .returning(columns)
    return rows[0] ?? null
  },

  async succeed(id, output, usage) {
    const now = new Date()
    await (await db())
      .update(t)
      .set({ status: 'succeeded', output, ...usage, updatedAt: now, completedAt: now })
      .where(eq(t.id, id))
  },

  async fail(id, error) {
    const now = new Date()
    await (await db())
      .update(t)
      .set({ status: 'failed', error: error.slice(0, 2000), updatedAt: now, completedAt: now })
      .where(eq(t.id, id))
  },

  async spentSince(since) {
    const [row] = await (await db())
      .select({
        costUsd: sql<string>`coalesce(sum(${t.costUsd}), 0)`,
        calls: sql<string>`count(*) filter (where ${t.status} = 'succeeded')`,
      })
      .from(t)
      .where(gte(t.completedAt, since))
    return { costUsd: Number(row?.costUsd ?? 0), calls: Number(row?.calls ?? 0) }
  },
}
