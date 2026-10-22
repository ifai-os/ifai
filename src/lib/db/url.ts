/**
 * Postgres connection string. DATABASE_URI is the Payload convention;
 * DATABASE_URL is what the Neon ↔ Vercel integration injects into preview deployments.
 */
export function databaseUrl(): string {
  return process.env.DATABASE_URI || process.env.DATABASE_URL || ''
}
