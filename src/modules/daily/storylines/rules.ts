/**
 * Ongoing storylines (docs/specs/daily.md「持续事件」): the small rules shared by the collection,
 * the assignment job and the tests. No server imports.
 */
import { slugify } from '../write/slug'

export const storylineStatuses = ['active', 'ended', 'merged'] as const
export type StorylineStatus = (typeof storylineStatuses)[number]

/** A storyline is offered to a new story while one of its stories was published this recently. */
export const storylineWindowDays = 90
/** At most this many ongoing storylines go into one call, most similar first. */
export const storylineCandidates = 8
/** And at most this many earlier stories without one, which could start a new storyline with it. */
export const partnerCandidates = 6
/**
 * Less similar than this (cosine, on the report's vector) is not offered at all. Far below the
 * same event's 0.75: a lawsuit's hearing and its settlement read quite differently.
 */
export const candidateMinSimilarity = 0.45

export function storylineSince(now: Date): Date {
  return new Date(now.getTime() - storylineWindowDays * 24 * 3_600_000)
}

/** A slug for a new storyline from its English name; numbered by the caller when taken. */
export function storylineSlug(englishName: string, fallbackId: number): string {
  return slugify(englishName) || `storyline-${fallbackId}`
}

export type StorylineDecision =
  | { kind: 'join'; storylineId: number }
  | { kind: 'new'; partnerIds: number[]; name: Record<'zh-Hans' | 'en' | 'ja' | 'ko', string>; summary: Record<'zh-Hans' | 'en' | 'ja' | 'ko', string> }
  | { kind: 'none' }

export type StorylineAnswer = {
  decision: 'join' | 'new' | 'none'
  storylineId?: number | null
  partnerIds?: number[] | null
  name?: Partial<Record<'zh-Hans' | 'en' | 'ja' | 'ko', string>> | null
  summary?: Partial<Record<'zh-Hans' | 'en' | 'ja' | 'ko', string>> | null
}

const nameLocales = ['zh-Hans', 'en', 'ja', 'ko'] as const

/**
 * The model's answer held to what it was offered: it may only join a storyline it was shown,
 * and start one only with stories it was shown and a name in every written language. Anything
 * else counts as「不属于」, so a bad answer never puts a story somewhere wrong.
 */
export function readDecision(answer: StorylineAnswer, offered: { storylines: readonly number[]; partners: readonly number[] }): StorylineDecision {
  if (answer.decision === 'join') {
    const id = answer.storylineId
    return typeof id === 'number' && offered.storylines.includes(id) ? { kind: 'join', storylineId: id } : { kind: 'none' }
  }
  if (answer.decision === 'new') {
    const partnerIds = [...new Set((answer.partnerIds ?? []).filter((id) => offered.partners.includes(id)))]
    const name = answer.name ?? {}
    const summary = answer.summary ?? {}
    if (!partnerIds.length || !nameLocales.every((locale) => name[locale]?.trim())) return { kind: 'none' }
    return {
      kind: 'new',
      partnerIds,
      name: Object.fromEntries(nameLocales.map((locale) => [locale, name[locale]!.trim()])) as Record<(typeof nameLocales)[number], string>,
      summary: Object.fromEntries(nameLocales.map((locale) => [locale, summary[locale]?.trim() ?? ''])) as Record<(typeof nameLocales)[number], string>,
    }
  }
  return { kind: 'none' }
}
