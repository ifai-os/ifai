import { databaseUrl } from '../src/lib/db/url'

const localHosts = new Set(['localhost', '127.0.0.1', '[::1]'])

/**
 * Sample data goes only into a database on this machine, so it can never end up on a real site.
 * The one exception is main's preview: .github/workflows/seed-main-preview.yml connects to the
 * Neon branch preview/main and says so with SEED_PREVIEW_MAIN=1.
 */
export function assertSeedTarget(what: string) {
  if (process.env.SEED_PREVIEW_MAIN === '1') {
    console.log(`Adding ${what} to main's preview database (SEED_PREVIEW_MAIN=1).`)
    return
  }
  let host = ''
  try {
    host = new URL(databaseUrl()).hostname
  } catch {
    // Reported below.
  }
  if (!localHosts.has(host)) {
    console.error(`Refusing to add ${what}: the database is on "${host || 'unknown'}", not this machine.`)
    process.exit(1)
  }
}
