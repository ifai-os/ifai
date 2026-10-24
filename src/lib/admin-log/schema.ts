import { index, integer, jsonb, pgTable, serial, text, timestamp } from '@payloadcms/db-postgres/drizzle/pg-core'

import type { LogDetail } from './rules'

/**
 * One row per thing an admin did in the back office (docs/specs/foundation.md「后台 · 操作记录」):
 * saving, creating or deleting a document, a button that calls one of the modules' own endpoints
 * (publish a story, delist an app, import a Skill version…), and signing in. Only names of the
 * changed fields are kept, never their values, except a status going from one value to another.
 * No foreign keys: the row stays when the admin or the document is deleted, with the email and
 * title as they were. Registered in payload.config.ts so Payload migrations create it.
 */
export const adminLog = pgTable(
  'admin_log',
  {
    id: serial('id').primaryKey(),
    at: timestamp('at', { withTimezone: true }).defaultNow().notNull(),
    adminId: integer('admin_id'),
    adminEmail: text('admin_email'),
    /** create | update | delete | login | action (one of the modules' endpoints) */
    kind: text('kind', { enum: ['create', 'update', 'delete', 'login', 'action'] }).notNull(),
    /** For `action`: the endpoint's key, e.g. "stories:review/publish" (see ./rules.ts `endpointAction`). */
    action: text('action'),
    collection: text('collection'),
    docId: text('doc_id'),
    docTitle: text('doc_title'),
    detail: jsonb('detail').$type<LogDetail>(),
  },
  (table) => [index('admin_log_at_idx').on(table.at), index('admin_log_doc_idx').on(table.collection, table.docId)],
)

export const adminLogTables = { admin_log: adminLog }
