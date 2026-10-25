import { slugify } from '@/modules/apps/normalize'

import { parseRepositoryUrl, type RepoRef } from '../import/github'

/**
 * 「转为 Skill」on a submission (docs/specs/resources.md, «后台» 1): what a new draft Skill starts
 * with, taken from the repository address alone. The owner corrects it while reviewing; the import
 * fills in the files, and the description is drafted from them.
 */
export type SkillSeed = {
  /** English display name; the other languages fall back to it until written. */
  name: string
  slug: string
  author: { name: string; url: string }
}

/** The folder that holds SKILL.md: a link to the file itself means its folder. */
function folderOf(ref: RepoRef): string {
  return (ref.subdir ?? '').replace(/(^|\/)SKILL\.md$/i, '').replace(/\/+$/, '')
}

/** "pdf-tools" → "Pdf Tools": a readable start, not a final name. */
function displayName(segment: string): string {
  const words = segment.split(/[-_.\s]+/).filter(Boolean)
  return words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ') || segment
}

/** The draft's name, slug and author from a GitHub address; null for anything that is not one. */
export function skillSeed(repository: string): SkillSeed | null {
  const ref = parseRepositoryUrl(repository)
  if (!ref) return null
  const folder = folderOf(ref).split('/').pop() ?? ''
  const source = folder || ref.repo
  return {
    name: displayName(source),
    slug: slugify(source) || slugify(ref.repo) || 'skill',
    author: { name: ref.owner, url: `https://github.com/${ref.owner}` },
  }
}

/**
 * Two addresses for the same Skill: same repository and folder, whatever the branch or tag
 * (GitHub names are case-insensitive). Addresses that are not GitHub repositories never match.
 */
export function sameSource(a: string, b: string): boolean {
  const left = parseRepositoryUrl(a)
  const right = parseRepositoryUrl(b)
  if (!left || !right) return false
  const key = (ref: RepoRef) => `${ref.owner}/${ref.repo}/${folderOf(ref)}`.toLowerCase()
  return key(left) === key(right)
}

/** `base`, or `base-2`, `base-3` … whichever is not taken yet, within the 64 characters a slug may have. */
export function freeSlug(base: string, taken: Iterable<string>): string {
  const used = new Set(taken)
  if (!used.has(base)) return base
  for (let n = 2; ; n += 1) {
    const suffix = `-${n}`
    const candidate = `${base.slice(0, 64 - suffix.length).replace(/-+$/, '')}${suffix}`
    if (!used.has(candidate)) return candidate
  }
}
