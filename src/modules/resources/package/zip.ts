import { unzipSync, zipSync, type Zippable } from 'fflate'

import { PACKAGE_LIMITS, type PackageFile, type PackageLimits, type RejectedFile } from './types'

/** Fixed entry time so the same files always give the same Zip and the same sha256. */
const FIXED_MTIME = new Date('2000-01-01T00:00:00Z')

/** The Zip users download: entries sorted, SKILL.md at the top level, no directory entries. */
export function buildZip(files: PackageFile[]): Buffer {
  const tree: Zippable = {}
  for (const file of [...files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))) {
    tree[file.path] = [file.data, { level: 6, mtime: FIXED_MTIME }]
  }
  return Buffer.from(zipSync(tree, { mtime: FIXED_MTIME }))
}

export type ReadZipResult = {
  files: PackageFile[]
  /** Entries left out because of the limits; the structure check reports them. */
  rejected: RejectedFile[]
  totalBytes: number
}

export class ZipError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ZipError'
  }
}

/** Read a package Zip into memory, applying the size limits before inflating anything. */
export function readZip(buffer: Uint8Array, limits: PackageLimits = PACKAGE_LIMITS): ReadZipResult {
  const rejected: RejectedFile[] = []
  let count = 0
  let total = 0
  let unzipped: Record<string, Uint8Array>
  try {
    unzipped = unzipSync(buffer, {
      filter: (entry) => {
        if (entry.name.endsWith('/')) return false
        count += 1
        if (count > limits.maxFiles) {
          rejected.push({ path: entry.name, reason: 'too_many_files' })
          return false
        }
        if (entry.originalSize > limits.maxFileBytes) {
          rejected.push({ path: entry.name, reason: 'file_too_large' })
          return false
        }
        total += entry.originalSize
        if (total > limits.maxTotalBytes) {
          rejected.push({ path: entry.name, reason: 'total_too_large' })
          return false
        }
        return true
      },
    })
  } catch (error) {
    throw new ZipError(`Not a valid Zip: ${(error as Error).message}`)
  }
  const files = Object.entries(unzipped).map(([path, data]) => ({ path, data }))
  return { files, rejected, totalBytes: total }
}
