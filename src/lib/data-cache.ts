import { createHash } from 'node:crypto'
import { unstable_cache } from 'next/cache'

import { databaseUrl } from './db/url'

let scope: string | undefined

/**
 * A short hash of the database the deployment reads. Vercel shares one data cache across
 * every Preview deployment, and a key that only names the query matches in each of them: a
 * pull request's preview, with its own Neon branch, would show the main preview's cached
 * results, and refreshing a tag in one would expire the others. Keys and tags carry this
 * hash, so deployments on the same database share entries and the rest never meet.
 */
export function dataCacheScope(): string {
  scope ??= createHash('sha256').update(databaseUrl()).digest('hex').slice(0, 12)
  return scope
}

/** The tag as stored in the data cache. `revalidateTag` takes this, never the bare name. */
export function dataTag(tag: string): string {
  return `${tag}@${dataCacheScope()}`
}

type CacheOptions = { tags?: string[]; revalidate?: number | false }

/** `unstable_cache`, with the key and tags scoped to this deployment's database. */
export function cached<Args extends unknown[], Result>(
  fn: (...args: Args) => Promise<Result>,
  keyParts: string[],
  options: CacheOptions = {},
): (...args: Args) => Promise<Result> {
  return unstable_cache(fn, [dataCacheScope(), ...keyParts], { ...options, tags: options.tags?.map(dataTag) })
}
