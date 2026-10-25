import { databaseUrl } from '../src/lib/db/url'

const localHosts = new Set(['localhost', '127.0.0.1', '[::1]'])

/**
 * Sample data goes only into a database on this machine, so it can never end up on a real site.
 * The one exception is a preview: .github/workflows/seed-main-preview.yml connects to the Neon
 * branch of main's preview (preview/main) or of a pull request's (preview/pr-<n>) and says so with
 * SEED_PREVIEW_MAIN=1. (The name is from when only main's preview had samples; the scripts of
 * other branches read it too.) Returns which of the two the database is.
 */
export function assertSeedTarget(what: string): 'local' | 'preview' {
  if (process.env.SEED_PREVIEW_MAIN === '1') {
    console.log(`Adding ${what} to a preview's database (SEED_PREVIEW_MAIN=1).`)
    return 'preview'
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
  return 'local'
}
