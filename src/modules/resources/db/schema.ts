import {
  date,
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from '@payloadcms/db-postgres/drizzle/pg-core'

export const installEventTypes = ['copy', 'download', 'fetch'] as const

/**
 * One row per install action (docs/specs/resources.md, `skill_events`, rule 14): copying the
 * install instruction, downloading the Zip, or a host fetching install.md. The same visitor
 * counts once per Skill per day (unique index), so repeated clicks do not inflate installs.
 * visitor_hash is a salted hash of IP + user agent; raw IPs are never stored. Rolled up hourly
 * into `skills.stats`. Registered in payload.config.ts so Payload migrations create it.
 */
export const skillEvents = pgTable(
  'skill_events',
  {
    id: serial('id').primaryKey(),
    skillId: integer('skill_id').notNull(),
    versionId: integer('version_id'),
    type: text('type', { enum: installEventTypes }).notNull(),
    hostSlug: text('host_slug'),
    visitorHash: text('visitor_hash').notNull(),
    day: date('day').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('skill_events_skill_visitor_day_idx').on(table.skillId, table.visitorHash, table.day),
    index('skill_events_skill_day_idx').on(table.skillId, table.day),
  ],
)

export const resourcesTables = { skill_events: skillEvents }
