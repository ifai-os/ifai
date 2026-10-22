/**
 * Review rules (docs/specs/daily.md「流程」8–9, the「IFAI 日报审核后台」board). Pure functions
 * shared by the endpoints and the admin screen: text limits, when another language is stale,
 * the queue order, the flags on a card and which action the primary button offers.
 */
import type { AnalysisFlag } from '../judge/rules'

/** Limits on the board: the simplified-Chinese title and summary, counted with `textLength`. */
export const TITLE_MAX = 40
export const SUMMARY_MAX = 120

/** Display length as on the board: a CJK character counts 1, an ASCII character ½. */
export function textLength(text: string | null | undefined): number {
  let total = 0
  for (const ch of text ?? '') total += ch.charCodeAt(0) < 128 ? 0.5 : 1
  return Math.ceil(total)
}

export type HansText = { title?: string | null; summary?: string | null; tryIt?: string | null }

/**
 * Fingerprint of the simplified-Chinese text the other languages were written from. When it
 * changes, those languages are stale and get rewritten before publishing. Runs the same in the
 * browser (live hints while editing) and on the server (FNV-1a over code points).
 */
export function hansHash(text: HansText): string {
  const joined = [text.title, text.summary, text.tryIt].map((value) => (value ?? '').trim().replace(/\s+/g, ' ')).join('\n')
  let hash = 0x811c9dc5
  for (const ch of joined) {
    hash ^= ch.codePointAt(0) ?? 0
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

/** The languages the model writes from the simplified Chinese; zh-Hant is converted, never written. */
export const rewrittenLocales = ['en', 'ja', 'ko'] as const
export type RewrittenLocale = (typeof rewrittenLocales)[number]

export function isRewrittenLocale(value: unknown): value is RewrittenLocale {
  return typeof value === 'string' && (rewrittenLocales as readonly string[]).includes(value)
}

/** One entry of `stories.localeStatus`. `basedOn` is the hansHash the text was written from. */
export type LocaleEntry = {
  status: 'written' | 'failed' | 'converted'
  at?: string
  model?: string
  error?: string
  basedOn?: string
}
export type LocaleStatus = Partial<Record<string, LocaleEntry>>

export type LocaleState = 'written' | 'stale' | 'failed' | 'missing'

export function localeState(entry: LocaleEntry | undefined, currentHash: string): LocaleState {
  if (!entry || !entry.status) return 'missing'
  if (entry.status === 'failed') return 'failed'
  if (entry.status === 'written' && entry.basedOn && entry.basedOn !== currentHash) return 'stale'
  return 'written'
}

export function localeStates(status: unknown, currentHash: string): Record<RewrittenLocale, LocaleState> {
  const entries = (status && typeof status === 'object' ? status : {}) as LocaleStatus
  return Object.fromEntries(rewrittenLocales.map((locale) => [locale, localeState(entries[locale], currentHash)])) as Record<
    RewrittenLocale,
    LocaleState
  >
}

/** Languages that must be (re)written before the story can be published. */
export function localesToRewrite(states: Record<RewrittenLocale, LocaleState>): RewrittenLocale[] {
  return rewrittenLocales.filter((locale) => states[locale] !== 'written')
}

export type MissingToken = { locale: string; token: string }
export type Verification = { ok: boolean; missing: MissingToken[]; checked: number }

export function asVerification(value: unknown): Verification | null {
  if (!value || typeof value !== 'object' || !Array.isArray((value as Verification).missing)) return null
  const v = value as Verification
  return { ok: Boolean(v.ok), missing: v.missing.filter((m) => m && typeof m.token === 'string'), checked: Number(v.checked) || 0 }
}

/**
 * Names and numbers the source check could not find, as far as they are still in the text:
 * the editor may have removed one since. A locale whose current text is unknown keeps its tokens.
 */
export function stillMissing(verification: Verification | null, texts: Partial<Record<string, string | null | undefined>>): MissingToken[] {
  if (!verification) return []
  const squash = (text: string) => text.replace(/\s+/g, '').toLowerCase()
  return verification.missing.filter((item) => {
    const text = texts[item.locale]
    if (text === undefined) return true
    return squash(text ?? '').includes(squash(item.token))
  })
}

export type QueueOrder = { laterAt?: string | null; heat?: number | null; score?: number | null; createdAt?: string | null }

/**
 * Queue order: by heat, then score, oldest first among equals;「稍后再看」items go to the
 * end, in the order they were set aside.
 */
export function compareQueue(a: QueueOrder, b: QueueOrder): number {
  const laterA = a.laterAt ?? null
  const laterB = b.laterAt ?? null
  if (laterA && laterB) return laterA.localeCompare(laterB)
  if (laterA !== laterB) return laterA ? 1 : -1
  const heat = (b.heat ?? 0) - (a.heat ?? 0)
  if (heat) return heat
  const score = (b.score ?? 0) - (a.score ?? 0)
  if (score) return score
  return (a.createdAt ?? '').localeCompare(b.createdAt ?? '')
}

export type QueueFlag =
  | { kind: 'more'; count: number }
  | { kind: 'duplicate' }
  | { kind: 'unverified'; count: number }
  | { kind: 'failed'; locales: RewrittenLocale[] }
  | { kind: 'gap'; points: number }
  | { kind: 'promotional' }
  | { kind: 'tutorial' }
  | { kind: 'later' }
  | { kind: 'withdrawn' }

export type FlagInput = {
  status: string
  moreReports: number
  duplicate: boolean
  unverified: number
  failedLocales: RewrittenLocale[]
  scoreA?: number | null
  scoreB?: number | null
  flags: AnalysisFlag[]
  laterAt?: string | null
}

/** The marks on a queue card, in the board's order. */
export function queueFlags(input: FlagInput): QueueFlag[] {
  const flags: QueueFlag[] = []
  if (input.moreReports > 0) flags.push({ kind: 'more', count: input.moreReports })
  if (input.duplicate) flags.push({ kind: 'duplicate' })
  if (input.unverified > 0) flags.push({ kind: 'unverified', count: input.unverified })
  if (input.failedLocales.length) flags.push({ kind: 'failed', locales: input.failedLocales })
  if (input.flags.includes('score_gap') && input.scoreA != null && input.scoreB != null) {
    flags.push({ kind: 'gap', points: Math.abs(input.scoreA - input.scoreB) })
  }
  if (input.flags.includes('promotional')) flags.push({ kind: 'promotional' })
  if (input.flags.includes('tutorial')) flags.push({ kind: 'tutorial' })
  if (input.laterAt) flags.push({ kind: 'later' })
  if (input.status === 'withdrawn') flags.push({ kind: 'withdrawn' })
  return flags
}

/** A card "has something to look at" when it carries any mark besides the report count. */
export function needsAttention(flags: QueueFlag[]): boolean {
  return flags.some((flag) => flag.kind !== 'more')
}

export type PrimaryInput = {
  published: boolean
  /** Something changed since the story was loaded (only matters for corrections). */
  dirty: boolean
  /** A rewrite or the publish itself is running. */
  busy: boolean
  duplicateOpen: boolean
  states: Record<RewrittenLocale, LocaleState>
  titleLength: number
  summaryLength: number
  unverified: number
}

export type PrimaryDecision =
  | { kind: 'busy' }
  | { kind: 'duplicate' }
  | { kind: 'failed'; locales: RewrittenLocale[] }
  | { kind: 'tooLong'; field: 'title' | 'summary' }
  /** Published and nothing changed: nothing to save. */
  | { kind: 'clean' }
  /** The simplified Chinese changed: these languages are rewritten first, then it goes out. */
  | { kind: 'rewrite'; locales: RewrittenLocale[] }
  /** Allowed, with a warning: some names or numbers were not found in the reports. */
  | { kind: 'unverified'; count: number }
  | { kind: 'ready' }

/** What the primary button does, in the board's order of precedence. */
export function primaryDecision(input: PrimaryInput): PrimaryDecision {
  if (input.busy) return { kind: 'busy' }
  if (input.duplicateOpen) return { kind: 'duplicate' }
  const failed = rewrittenLocales.filter((locale) => input.states[locale] === 'failed')
  if (failed.length) return { kind: 'failed', locales: failed }
  if (input.titleLength > TITLE_MAX) return { kind: 'tooLong', field: 'title' }
  if (input.summaryLength > SUMMARY_MAX) return { kind: 'tooLong', field: 'summary' }
  if (input.published && !input.dirty) return { kind: 'clean' }
  const rewrite = localesToRewrite(input.states)
  if (rewrite.length) return { kind: 'rewrite', locales: rewrite }
  if (input.unverified > 0) return { kind: 'unverified', count: input.unverified }
  return { kind: 'ready' }
}

/** Whether the decision lets the button be pressed. */
export function primaryEnabled(decision: PrimaryDecision): boolean {
  return decision.kind === 'rewrite' || decision.kind === 'unverified' || decision.kind === 'ready'
}

/** After acting on an item, the one that takes its place in the queue. */
export function nextAfter<T extends { id: number }>(queue: T[], id: number): T | null {
  const index = queue.findIndex((item) => item.id === id)
  const rest = queue.filter((item) => item.id !== id)
  if (!rest.length) return null
  return index < 0 ? rest[0] : rest[Math.min(index, rest.length - 1)]
}
