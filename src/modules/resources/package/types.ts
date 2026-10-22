/** One file inside a Skill package, path relative to the directory that holds SKILL.md. */
export type PackageFile = {
  path: string
  data: Uint8Array
}

export type PackageLimits = {
  maxFiles: number
  maxTotalBytes: number
  maxFileBytes: number
}

/** Size limits of a Skill package (docs/specs/resources.md, «静态检测», 包结构). */
export const PACKAGE_LIMITS: PackageLimits = {
  maxFiles: 200,
  maxTotalBytes: 10 * 1024 * 1024,
  maxFileBytes: 2 * 1024 * 1024,
}

export const SKILL_FILE = 'SKILL.md'

/** Why a file was left out when a package was read against the limits. */
export type RejectedFile = {
  path: string
  reason: 'too_many_files' | 'file_too_large' | 'total_too_large'
}

/** Files that never belong in a package and are dropped silently. */
export function isJunkPath(path: string): boolean {
  const name = path.split('/').pop() ?? path
  return name === '.DS_Store' || name === 'Thumbs.db' || path.startsWith('.git/') || path.includes('/.git/')
}

export function utf8(data: Uint8Array): string {
  return new TextDecoder('utf-8', { fatal: false }).decode(data)
}
