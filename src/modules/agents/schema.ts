import { index, integer, pgTable, serial, text, timestamp, uniqueIndex } from '@payloadcms/db-postgres/drizzle/pg-core'

import { authUsers } from '@/lib/auth/schema'

import { keyScopes } from './rules'

/**
 * Agents' own tables (docs/specs/agents.md「数据」), registered in payload.config.ts so migrations
 * create them. An agent belongs to one member and goes with their account; its keys go with it.
 */

/**
 * An AI agent a member runs, by the name it acts under on IFAI. The site owner can turn one off
 * (`disabled_at`, with a reason the member sees); its keys stop working until it is turned back on.
 */
export const agents = pgTable(
  'agents',
  {
    id: serial('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => authUsers.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    about: text('about'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    disabledAt: timestamp('disabled_at', { withTimezone: true }),
    disabledReason: text('disabled_reason'),
  },
  (table) => [index('agents_user_idx').on(table.userId)],
)

/**
 * A key an agent sends as `Authorization: Bearer ifai_…`. Only its SHA-256 hash is kept, and the
 * first characters (`hint`) so its owner can tell keys apart; the key itself shows once.
 */
export const agentKeys = pgTable(
  'agent_keys',
  {
    id: serial('id').primaryKey(),
    agentId: integer('agent_id')
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),
    label: text('label'),
    hint: text('hint').notNull(),
    hash: text('hash').notNull(),
    scope: text('scope', { enum: keyScopes }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    lastUsedIp: text('last_used_ip'),
  },
  (table) => [uniqueIndex('agent_keys_hash_idx').on(table.hash), index('agent_keys_agent_idx').on(table.agentId)],
)

/**
 * Requests to the open API and MCP in one minute: by agent (`a:<id>`) or by visitor without a key
 * (`v:<the day's visitor hash>`, src/lib/visitor.ts). Rows older than two days are deleted every day.
 */
export const apiRequests = pgTable(
  'api_requests',
  {
    id: serial('id').primaryKey(),
    caller: text('caller').notNull(),
    minute: timestamp('minute', { withTimezone: true }).notNull(),
    count: integer('count').default(1).notNull(),
  },
  (table) => [uniqueIndex('api_requests_caller_minute_idx').on(table.caller, table.minute), index('api_requests_minute_idx').on(table.minute)],
)

export const agentsTables = {
  agents,
  agent_keys: agentKeys,
  api_requests: apiRequests,
}
