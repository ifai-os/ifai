import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

import { peakHeat, signalsOf, type HeatMember, type HeatThread } from '../modules/daily/heat/rules'

type Row = Record<string, unknown>
const dateOf = (value: unknown) => new Date(value as string)

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "stories" ADD COLUMN "heat_peak" numeric;`)

  // 传播指数 for the stories already there: the highest heat their event's signals ever gave it
  // (src/modules/daily/heat/rules.ts), the same the heat job keeps from now on.
  const members = await db.execute(sql`
    SELECT ei.event_id, ei.item_id, ei.relation, ri.source_id, ri.published_at, ri.discovered_at, ri.signals
    FROM event_items ei JOIN raw_items ri ON ri.id = ei.item_id
    WHERE ei.event_id IN (SELECT DISTINCT event_id FROM stories)`)
  const threads = await db.execute(sql`
    SELECT item_id, source_id, points, posted_at, first_seen_at FROM hot_signals`)
  const hotSources = await db.execute(sql`SELECT id FROM sources WHERE "use" = 'hot_signal'`)
  const hot = new Set((hotSources.rows as Row[]).map((row) => Number(row.id)))

  const signals = signalsOf(
    (members.rows as Row[]).map(
      (row): HeatMember => ({
        eventId: Number(row.event_id),
        itemId: Number(row.item_id),
        relation: row.relation as HeatMember['relation'],
        sourceId: Number(row.source_id),
        publishedAt: row.published_at ? dateOf(row.published_at) : null,
        discoveredAt: dateOf(row.discovered_at),
        points: (row.signals as { points?: number } | null)?.points ?? null,
      }),
    ),
    (threads.rows as Row[]).map(
      (row): HeatThread => ({
        itemId: Number(row.item_id),
        sourceId: Number(row.source_id),
        points: Number(row.points),
        postedAt: dateOf(row.posted_at),
        firstSeenAt: dateOf(row.first_seen_at),
      }),
    ),
    (sourceId) => hot.has(sourceId),
  )
  for (const [eventId, list] of signals) {
    const peak = peakHeat(list)
    if (peak > 0) await db.execute(sql`UPDATE stories SET heat_peak = ${peak} WHERE event_id = ${eventId}`)
  }
  await db.execute(sql`
   UPDATE stories SET heat_peak = heat WHERE heat > COALESCE(heat_peak, 0);`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "stories" DROP COLUMN "heat_peak";`)
}
