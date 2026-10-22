import type { TarArchive } from './tar'
import { isJunkPath, SKILL_FILE, type PackageFile } from './types'

/**
 * Where in a repository snapshot the Skill lives, and the files that make up its package.
 * `subdir` comes from the repository address (…/tree/<ref>/<path>) or the import request.
 */
export type Selection = {
  /** Directory inside the archive (after the archive's own top folder); '' = repository root. */
  dir: string
  files: PackageFile[]
  symlinks: string[]
  /** Entries that are neither files, directories nor links (devices, fifos). */
  others: string[]
  /** A LICENSE / COPYING file at the repository root, if any. */
  repoLicenseFile?: string
}

export type SelectionError = {
  error: 'no_skill_md' | 'ambiguous'
  /** Directories that contain a SKILL.md, relative to the repository root. */
  candidates: string[]
}

const licensePattern = /^(LICENSE|LICENCE|COPYING)(\.[A-Za-z0-9]+)?$/i

/** The folder `git archive --prefix` put everything under, e.g. "skills-main/". */
function topFolder(archive: TarArchive): string {
  const first = archive.entries[0]?.path.split('/')[0]
  if (!first) return ''
  return archive.entries.every((entry) => entry.path === first || entry.path.startsWith(`${first}/`)) ? `${first}/` : ''
}

function trimSlashes(value: string): string {
  return value.replace(/^\/+|\/+$/g, '')
}

export function selectSkillDir(archive: TarArchive, subdir?: string): Selection | SelectionError {
  const top = topFolder(archive)
  const relative = (path: string) => (top && path.startsWith(top) ? path.slice(top.length) : path)
  const files = archive.entries.filter((entry) => entry.type === 'file')

  const candidates = files
    .filter((entry) => relative(entry.path).split('/').pop() === SKILL_FILE)
    .map((entry) => relative(entry.path).slice(0, -SKILL_FILE.length).replace(/\/$/, ''))
    .sort()

  let dir: string
  const wanted = subdir ? trimSlashes(subdir) : ''
  if (wanted) {
    if (!candidates.includes(wanted)) return { error: 'no_skill_md', candidates: candidates.slice(0, 20) }
    dir = wanted
  } else if (candidates.includes('')) {
    dir = ''
  } else if (candidates.length === 1) {
    dir = candidates[0]
  } else {
    return { error: candidates.length ? 'ambiguous' : 'no_skill_md', candidates: candidates.slice(0, 20) }
  }

  const base = dir ? `${dir}/` : ''
  const inside = (path: string) => (base ? path.startsWith(base) : true)
  const selection: Selection = { dir, files: [], symlinks: [], others: [] }
  for (const entry of archive.entries) {
    const rel = relative(entry.path)
    if (!inside(rel) || rel === base.replace(/\/$/, '')) continue
    const path = rel.slice(base.length)
    if (!path || entry.type === 'dir' || isJunkPath(path)) continue
    if (entry.type === 'file') selection.files.push({ path, data: entry.data })
    else if (entry.type === 'symlink' || entry.type === 'hardlink') selection.symlinks.push(path)
    else selection.others.push(path)
  }

  const rootLicense = files.find((entry) => {
    const rel = relative(entry.path)
    return !rel.includes('/') && licensePattern.test(rel)
  })
  if (rootLicense) selection.repoLicenseFile = relative(rootLicense.path)
  return selection
}

export function isSelectionError(value: Selection | SelectionError): value is SelectionError {
  return 'error' in value
}
