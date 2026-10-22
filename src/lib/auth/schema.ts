import { boolean, index, integer, pgTable, text, timestamp } from '@payloadcms/db-postgres/drizzle/pg-core'

/**
 * Better Auth tables (site members). They are registered with Payload's Postgres
 * adapter in payload.config.ts, so `payload migrate:create` includes them and the
 * database only ever changes through Payload migrations.
 *
 * Columns follow Better Auth's core schema in snake_case; the field → column
 * mapping lives in ./auth.ts and must be kept in sync with this file. The extra
 * member fields (handle, trust_level, ui_locale) come from the tech plan's data model.
 */

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
}

export const authUsers = pgTable('auth_users', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').default(false).notNull(),
  image: text('image'),
  handle: text('handle').unique(),
  trustLevel: integer('trust_level').default(0).notNull(),
  uiLocale: text('ui_locale'),
  ...timestamps,
})

export const authSessions = pgTable(
  'auth_sessions',
  {
    id: text('id').primaryKey(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    token: text('token').notNull().unique(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id')
      .notNull()
      .references(() => authUsers.id, { onDelete: 'cascade' }),
    ...timestamps,
  },
  (table) => [index('auth_sessions_user_id_idx').on(table.userId)],
)

export const authAccounts = pgTable(
  'auth_accounts',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => authUsers.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
    scope: text('scope'),
    password: text('password'),
    ...timestamps,
  },
  (table) => [index('auth_accounts_user_id_idx').on(table.userId)],
)

export const authVerifications = pgTable(
  'auth_verifications',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (table) => [index('auth_verifications_identifier_idx').on(table.identifier)],
)

/** Keyed by table name, for Payload's beforeSchemaInit hook. */
export const authTables = {
  auth_users: authUsers,
  auth_sessions: authSessions,
  auth_accounts: authAccounts,
  auth_verifications: authVerifications,
}
