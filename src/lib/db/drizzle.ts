import config from '@payload-config'
import type { PostgresAdapter } from '@payloadcms/db-postgres'
import { getPayload } from 'payload'

/**
 * Payload plus its Drizzle instance, for the module tables that are not Payload collections
 * (model_receipts, raw_items). Rule 2 in AGENTS.md: one ORM, through Payload.
 */
export async function getDb() {
  const payload = await getPayload({ config })
  return { payload, db: (payload.db as unknown as PostgresAdapter).drizzle }
}
