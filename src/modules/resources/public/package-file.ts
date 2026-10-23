import { readFile } from 'node:fs/promises'
import path from 'node:path'

import config from '@payload-config'
import { unzipSync } from 'fflate'
import { unstable_cache } from 'next/cache'
import { createLocalReq, getPayload } from 'payload'

import { PACKAGE_LIMITS, utf8 } from '../package/types'

/** A file inside a published version's Zip, for the「文件」tab. */
export type PackageFileText = { kind: 'text'; text: string } | { kind: 'binary' } | { kind: 'missing' }

/**
 * The stored Zip, read the way Payload serves it: through the storage adapter's handler (R2 in
 * production, streamed because `internalRead` turns off the signed redirect), or from the local
 * upload folder when no adapter is configured.
 */
async function readStoredZip(filename: string): Promise<Uint8Array | null> {
  const payload = await getPayload({ config })
  const collection = payload.collections['skill-versions'].config
  const { docs } = await payload.find({
    collection: 'skill-versions',
    where: { filename: { equals: filename } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  const doc = docs[0]
  if (!doc) return null
  const req = await createLocalReq({ context: { internalRead: true } }, payload)
  for (const handler of collection.upload.handlers ?? []) {
    const response = await handler(req, { doc, headers: new Headers(), params: { collection: collection.slug, filename } })
    if (!(response instanceof Response)) continue
    if (!response.ok) return null
    return new Uint8Array(await response.arrayBuffer())
  }
  const dir = path.resolve(collection.upload.staticDir || collection.slug)
  const file = path.resolve(dir, filename)
  if (!file.startsWith(dir + path.sep)) return null
  try {
    return new Uint8Array(await readFile(file))
  } catch {
    return null
  }
}

function extract(zip: Uint8Array, wanted: string): Uint8Array | null {
  let found: Uint8Array | undefined
  try {
    found = unzipSync(zip, { filter: (entry) => entry.name === wanted && entry.originalSize <= PACKAGE_LIMITS.maxFileBytes })[wanted]
  } catch {
    return null
  }
  return found ?? null
}

/** Binary when it has NUL bytes or does not decode as UTF-8. */
function looksBinary(data: Uint8Array): boolean {
  if (data.subarray(0, 8000).includes(0)) return true
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(data)
    return false
  } catch {
    return true
  }
}

/**
 * One file of a version, as text. A version's Zip never changes once published (rule 2), so
 * the result is cached by the Zip's sha256 and the path, with no expiry.
 */
export const readPackageFile = unstable_cache(
  async (filename: string, _sha256: string, filePath: string): Promise<PackageFileText> => {
    const zip = await readStoredZip(filename)
    // Not cached: storage may only be unreachable for now.
    if (!zip) throw new Error(`Could not read the stored Zip ${filename}`)
    const data = extract(zip, filePath)
    if (!data) return { kind: 'missing' }
    return looksBinary(data) ? { kind: 'binary' } : { kind: 'text', text: utf8(data) }
  },
  ['skills-package-file'],
)
