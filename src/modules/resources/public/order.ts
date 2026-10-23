import type { SkillCategory } from '../categories'
import { compareVersions } from '../normalize'
import type { SkillSort } from './list-params'

/** What the list needs of every published Skill to filter and order them in memory. */
export type SkillCandidate = {
  id: number
  category: SkillCategory
  /** Display names, one-line summaries and tag names in every language, plus the slug: what a search looks in. */
  searchText: string
  tagSlugs: string[]
  author: string
  needsApiKey: boolean
  certified: boolean
  installs: number
  installs7d: number
  /** When its first version was published: 上新. */
  listedAt: string | null
  /** When its current version was published: 更新时间. */
  updatedAt: string | null
}

export type SkillFilter = {
  category: SkillCategory | null
  q: string
  tag: string
  author: string
  noKey: boolean
  certified: boolean
}

/** Lower case and one space between words, so 「Code  Review」 finds 「code review」. */
export function searchable(value: string): string {
  return value.toLocaleLowerCase('en').replace(/\s+/g, ' ')
}

export function filterSkills<T extends SkillCandidate>(skills: T[], filter: SkillFilter): T[] {
  const q = searchable(filter.q.trim())
  const author = filter.author.toLocaleLowerCase('en')
  return skills.filter(
    (skill) =>
      (!filter.category || skill.category === filter.category) &&
      (!filter.tag || skill.tagSlugs.includes(filter.tag)) &&
      (!author || skill.author.toLocaleLowerCase('en') === author) &&
      (!filter.noKey || !skill.needsApiKey) &&
      (!filter.certified || skill.certified) &&
      (!q || skill.searchText.includes(q)),
  )
}

const time = (iso: string | null) => (iso ? Date.parse(iso) || 0 : 0)

/**
 * 综合 = certified first, then installs in the last 7 days, then the latest update
 * (docs/specs/resources.md). 近期飙升 orders by the last 7 days until the hourly roll-up also
 * keeps the week before; 安装数 by all-time installs; 最近上新 by when the Skill was first published.
 * Ties go to the more recently updated Skill, then the lower id, so the order never jumps.
 */
export function orderSkills<T extends SkillCandidate>(skills: T[], sort: SkillSort): T[] {
  const byUpdate = (a: T, b: T) => time(b.updatedAt) - time(a.updatedAt) || a.id - b.id
  const compare: Record<SkillSort, (a: T, b: T) => number> = {
    default: (a, b) => Number(b.certified) - Number(a.certified) || b.installs7d - a.installs7d || byUpdate(a, b),
    rising: (a, b) => b.installs7d - a.installs7d || b.installs - a.installs || byUpdate(a, b),
    installs: (a, b) => b.installs - a.installs || byUpdate(a, b),
    newest: (a, b) => time(b.listedAt) - time(a.listedAt) || byUpdate(a, b),
  }
  return [...skills].sort(compare[sort])
}

/** Published in the last seven days: 本周新增. */
export function isNewThisWeek(skill: Pick<SkillCandidate, 'listedAt'>, now: Date): boolean {
  return skill.listedAt !== null && now.getTime() - time(skill.listedAt) <= 7 * 24 * 60 * 60 * 1000
}

/** 本周精选: the one the owner ticked (the most recently updated, if several); otherwise the most recently updated certified Skill. */
export function pickFeatured<T extends SkillCandidate & { featured: boolean }>(skills: T[]): T | null {
  const newest = (list: T[]) => [...list].sort((a, b) => time(b.updatedAt) - time(a.updatedAt) || a.id - b.id)[0] ?? null
  return newest(skills.filter((skill) => skill.featured)) ?? newest(skills.filter((skill) => skill.certified))
}

/** Tags by how many published Skills carry them, most first; ties in slug order. */
export function hotTags(skills: Pick<SkillCandidate, 'tagSlugs'>[], count: number): string[] {
  const uses = new Map<string, number>()
  for (const skill of skills) for (const slug of skill.tagSlugs) uses.set(slug, (uses.get(slug) ?? 0) + 1)
  return [...uses.entries()]
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .slice(0, count)
    .map(([slug]) => slug)
}

/**
 * The version a Skill's page shows and installs: its current version while that is published;
 * if the owner withdrew or deprecated it without picking another, the newest published one.
 */
export function effectiveCurrent<T extends { id: number; version: string; status: string }>(currentId: number | null, versions: T[]): T | null {
  const published = versions.filter((version) => version.status === 'published')
  return published.find((version) => version.id === currentId) ?? published.sort((a, b) => compareVersions(b.version, a.version))[0] ?? null
}
