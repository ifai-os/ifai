import { createHash } from 'node:crypto'

import { scanPackage, type Check, type Finding, type LicenseContext, type ScanStatus } from '../scan/scan'
import type { Frontmatter } from './frontmatter'
import type { PackageFile } from './types'
import { readZip } from './zip'

/** What the import job knows about the repository and passes to the version's upload hook. */
export type ImportContext = {
  importLicense?: LicenseContext
  /** Links found in the repository directory; they are left out of the Zip but must still block. */
  importSymlinks?: string[]
  importOthers?: string[]
}

/** The version fields that come from the Zip itself. */
export type Inspection = {
  sha256: string
  files: { path: string; size: number; sha256: string }[]
  skillMd: string | null
  frontmatter: Frontmatter | null
  declaredDomains: string[]
  observedDomains: string[]
  scanStatus: ScanStatus
  scannedAt: string
  checks: Check[]
  findings: Finding[]
}

const sha256 = (data: Uint8Array) => createHash('sha256').update(data).digest('hex')

/**
 * Read a package Zip and run the static scan over it. Never throws: a Zip that cannot be read
 * is a blocked version with one structure finding, so the owner sees why in the back office.
 */
export function inspectPackage(zip: Uint8Array, license: LicenseContext, context: ImportContext = {}, now: Date = new Date()): Inspection {
  let files: PackageFile[] = []
  let scan: ReturnType<typeof scanPackage>
  try {
    const read = readZip(zip)
    files = read.files
    scan = scanPackage({ files, rejected: read.rejected, symlinks: context.importSymlinks, others: context.importOthers, license })
  } catch (error) {
    const message = (error as Error).message
    scan = {
      status: 'blocked',
      checks: [{ key: 'structure', result: 'block', note: message }],
      findings: [{ severity: 'high', message }],
      skillMd: null,
      domains: [],
      declaredDomains: [],
    }
  }
  return {
    sha256: sha256(zip),
    files: files.map((file) => ({ path: file.path, size: file.data.length, sha256: sha256(file.data) })),
    skillMd: scan.skillMd?.raw ?? null,
    frontmatter: scan.skillMd?.frontmatter ?? null,
    declaredDomains: scan.declaredDomains,
    observedDomains: scan.domains,
    scanStatus: scan.status,
    scannedAt: now.toISOString(),
    checks: scan.checks,
    findings: scan.findings,
  }
}
