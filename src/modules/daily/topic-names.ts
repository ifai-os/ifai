import type { PostgresAdapter } from '@payloadcms/db-postgres'
import { sql } from '@payloadcms/db-postgres/drizzle'

import { entityKinds, type EntityKind } from './entities'

/** A company's or product's name and kind as its newest published story writes them (as its topic page does). */
export type TopicName = { name: string; kind: EntityKind }

/**
 * The names of the topics with these keys, for「我的关注」and the data export; a key no published
 * story is about now is left out. One query over the stories' companies and products.
 */
export async function readTopicNames(db: PostgresAdapter['drizzle'], keys: readonly string[]): Promise<Map<string, TopicName>> {
  if (keys.length === 0) return new Map()
  const rows = await db.execute<{ key: string; name: string; kind: string }>(sql`
    select distinct on (e.key) e.key, e.name, e.kind from stories_entities e
    join stories s on s.id = e._parent_id
    where s.status = 'published' and e.key in (${sql.join(
      keys.map((key) => sql`${key}`),
      sql`, `,
    )})
    order by e.key, s.published_at desc nulls last, s.id desc`)
  const kindOf = (kind: string): EntityKind => ((entityKinds as readonly string[]).includes(kind) ? (kind as EntityKind) : 'product')
  return new Map(rows.rows.map((row) => [row.key, { name: row.name, kind: kindOf(row.kind) }]))
}
