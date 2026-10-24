/**
 * The Wiki's rules as pure functions (docs/specs/wiki.md「已定的规则」): entry types, what an
 * entry needs before it is published, prerequisite cycles, and how the two-way relations of
 * many entries come together on one entry's page.
 */

import type { InLanguage } from '@/lib/i18n/localized'

/** 概念 / 方法 (rule 1). A method adds steps. */
export const entryTypes = ['concept', 'method'] as const

export type EntryType = (typeof entryTypes)[number]

export function isEntryType(value: unknown): value is EntryType {
  return typeof value === 'string' && (entryTypes as readonly string[]).includes(value)
}

/** Slugs that would collide with the fixed pages under /[locale]/wiki. */
export const reservedEntrySlugs: readonly string[] = ['topics', 'entries']

/** A field an entry is missing before it can be published, by its path in the back office. */
export type MissingField =
  | 'title'
  | 'definition'
  | 'explanation'
  | 'examples'
  | 'limitations'
  | 'steps'
  | 'topics'
  | 'sources'
  | 'reviewedAt'

/** The English texts every language falls back to (rule 4). */
export type EnglishTexts = {
  title?: unknown
  definition?: unknown
  explanation?: unknown
  examples?: unknown
  limitations?: unknown
  steps?: unknown
}

/** The fields shared by every language. */
export type SharedFields = {
  type?: unknown
  topics?: unknown
  sources?: unknown
  reviewedAt?: unknown
}

function filled(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0
}

/** Rows of an array field that have their required text. */
function rows(value: unknown, textKey: string): number {
  if (!Array.isArray(value)) return 0
  return value.filter((row) => row && typeof row === 'object' && filled((row as Record<string, unknown>)[textKey])).length
}

function count(value: unknown): number {
  return Array.isArray(value) ? value.filter((item) => item !== null && item !== undefined && item !== '').length : 0
}

/**
 * What is still missing before an entry can go public (rule 4, PRD R07 and R26), in the order
 * the back office shows the fields; empty when it is complete.
 */
export function missingForPublish(english: EnglishTexts, shared: SharedFields): MissingField[] {
  const missing: MissingField[] = []
  if (!filled(english.title)) missing.push('title')
  if (!filled(english.definition)) missing.push('definition')
  if (!filled(english.explanation)) missing.push('explanation')
  if (rows(english.examples, 'text') === 0) missing.push('examples')
  if (shared.type === 'method' && rows(english.steps, 'title') === 0) missing.push('steps')
  if (!filled(english.limitations)) missing.push('limitations')
  if (count(shared.topics) === 0) missing.push('topics')
  if (rows(shared.sources, 'url') === 0) missing.push('sources')
  if (!filled(shared.reviewedAt)) missing.push('reviewedAt')
  return missing
}

/**
 * The prerequisite that would close a loop (rule 6), given the prerequisites every other entry
 * has now: the first of `id`'s own from which `id` can be reached again (itself included), or
 * null when there is none. A new entry (no id yet) cannot be anyone's prerequisite, so it has none.
 */
export function prerequisiteLoop(
  id: number | null,
  prerequisites: readonly number[],
  others: ReadonlyMap<number, readonly number[]>,
): number | null {
  if (id === null) return null
  for (const start of prerequisites) {
    const seen = new Set<number>()
    const queue = [start]
    while (queue.length > 0) {
      const current = queue.shift() as number
      if (current === id) return start
      if (seen.has(current)) continue
      seen.add(current)
      queue.push(...(others.get(current) ?? []))
    }
  }
  return null
}

/** One entry's relations as stored: ids of other entries. */
export type StoredRelations = {
  id: number
  prerequisites: readonly number[]
  related: readonly number[]
  /** The other entry of each 易混 row. */
  comparisons: readonly number[]
}

export type GatheredRelations = {
  /** 容易混淆: listed on either side, with the side whose text to show (its own row first). */
  comparisons: { id: number; from: 'own' | 'other' }[]
  /** 先读这些: this entry's own prerequisites. */
  prerequisites: number[]
  /** 接着读: the entries that list this one as a prerequisite. */
  next: number[]
  /** 相关条目: listed on either side. */
  related: number[]
}

/**
 * The relations to show on one entry's page (rule 6): two-way relations filled on either side
 * show on both pages, and only entries for which `shown` is true (published ones) appear at all.
 * Every other entry appears once, in the first place it fits: 容易混淆 (it comes with the
 * difference), then 先读这些, 接着读 and 相关条目.
 */
export function gatherRelations(
  entry: StoredRelations,
  all: readonly StoredRelations[],
  shown: (id: number) => boolean,
): GatheredRelations {
  const visible = (id: number) => id !== entry.id && shown(id)
  const unique = (ids: Iterable<number>) => [...new Set(ids)].filter(visible)
  const others = all.filter((other) => other.id !== entry.id)

  const comparisons = [
    ...entry.comparisons.map((id) => ({ id, from: 'own' as const })),
    ...others.filter((other) => other.comparisons.includes(entry.id)).map((other) => ({ id: other.id, from: 'other' as const })),
  ].filter((item, index, list) => visible(item.id) && list.findIndex((first) => first.id === item.id) === index)

  const taken = new Set(comparisons.map((item) => item.id))
  const place = (ids: Iterable<number>) => {
    const placed = unique(ids).filter((id) => !taken.has(id))
    for (const id of placed) taken.add(id)
    return placed
  }
  const prerequisites = place(entry.prerequisites)
  const next = place(others.filter((other) => other.prerequisites.includes(entry.id)).map((other) => other.id))
  const related = place([...entry.related, ...others.filter((other) => other.related.includes(entry.id)).map((other) => other.id)])
  return { comparisons, prerequisites, next, related }
}

/** Paragraphs of a plain-text field: blank lines separate them (docs/specs/wiki.md「不做」: no rich text yet). */
export function paragraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter(Boolean)
}

/** Today's pick from a list (今日条目): the same one all day in Shanghai, the next one tomorrow. */
export function pickOfTheDay<T>(items: readonly T[], shanghaiDate: string): T | null {
  if (items.length === 0) return null
  const day = Math.floor(Date.parse(`${shanghaiDate}T00:00:00Z`) / 86_400_000)
  return items[((day % items.length) + items.length) % items.length] ?? null
}

/**
 * The names after「又称」(rule 7): the English name on a page in another language, then the
 * aliases in the page's language, without repeating the title or one another.
 */
export function otherNames(title: InLanguage<string>, english: string, aliases: InLanguage<string[]> | null): InLanguage<string>[] {
  const names: InLanguage<string>[] = [
    ...(title.lang !== 'en' ? [{ value: english.trim(), lang: 'en' as const }] : []),
    ...(aliases ? aliases.value.map((value) => ({ value: value.trim(), lang: aliases.lang })) : []),
  ]
  const seen = new Set([title.value.trim().toLowerCase()])
  return names.filter(({ value }) => {
    const key = value.toLowerCase()
    if (!value || seen.has(key)) return false
    seen.add(key)
    return true
  })
}
