/**
 * Fill「涉及的公司与产品」(and「行业标签」where the analysis has them) on stories written before
 * those fields existed (docs/specs/daily.md「详情页：…」), from the structuring step's stored
 * result. No model is called. Stories that already have companies and products, or tags, keep
 * theirs. Safe to run again.
 *
 *   pnpm payload run scripts/backfill-story-tags.ts
 */
import config from '@payload-config'
import type { PostgresAdapter } from '@payloadcms/db-postgres'
import { inArray } from '@payloadcms/db-postgres/drizzle'
import { getPayload } from 'payload'

import { storyEntities } from '../src/modules/daily/entities'
import { itemAnalyses } from '../src/modules/daily/schema'
import { tagsOf } from '../src/modules/daily/tags'

const payload = await getPayload({ config })
const db = (payload.db as unknown as PostgresAdapter).drizzle

const { docs } = await payload.find({
  collection: 'stories',
  pagination: false,
  depth: 0,
  select: { representativeItemId: true, tags: true, entities: true },
})
const rows = docs.length
  ? await db
      .select({ itemId: itemAnalyses.itemId, structure: itemAnalyses.structure })
      .from(itemAnalyses)
      .where(inArray(itemAnalyses.itemId, [...new Set(docs.map((doc) => doc.representativeItemId))]))
  : []
const byItem = new Map(rows.map((row) => [row.itemId, row.structure]))

let updated = 0
for (const doc of docs) {
  const structure = byItem.get(doc.representativeItemId)
  if (!structure) continue
  const data: { tags?: ReturnType<typeof tagsOf>; entities?: ReturnType<typeof storyEntities> } = {}
  if (!doc.entities?.length) {
    const entities = storyEntities(structure)
    if (entities.length) data.entities = entities
  }
  if (!doc.tags?.length) {
    const tags = tagsOf(structure.tags)
    if (tags.length) data.tags = tags
  }
  if (!data.entities && !data.tags) continue
  // Only these fields change; the hooks that follow publishing see nothing new.
  await payload.update({ collection: 'stories', id: doc.id, data, depth: 0 })
  updated++
}

console.log(`Stories read: ${docs.length}; filled: ${updated}`)
process.exit(0)
