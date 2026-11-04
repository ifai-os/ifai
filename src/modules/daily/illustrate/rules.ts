/**
 * AI pictures for stories without one (docs/specs/daily.md「AI 配图」): the pure parts, so they
 * can be tested without a database or a model.
 */
type Env = Record<string, string | undefined>

/** A story is drawn this long after it was created at the earliest: an import copies its own picture in the meantime. */
export const ILLUSTRATE_AFTER_MS = 30 * 60 * 1000
/** At most this many stories are queued per sweep, so a backlog is worked off a little at a time. */
export const ILLUSTRATE_PER_SWEEP = 5
/** Pictures drawn per Shanghai day unless STORY_ILLUSTRATIONS_PER_DAY says otherwise. */
export const DEFAULT_ILLUSTRATIONS_PER_DAY = 30

/** STORY_ILLUSTRATIONS_PER_DAY when it is a whole number ≥ 0, otherwise the default. */
export function illustrationsPerDay(env: Env = process.env): number {
  const raw = env.STORY_ILLUSTRATIONS_PER_DAY?.trim()
  const value = Number(raw)
  return raw && Number.isInteger(value) && value >= 0 ? value : DEFAULT_ILLUSTRATIONS_PER_DAY
}

/** How many stories this sweep may queue, given the pictures already started today. */
export function sweepSize(perDay: number, startedToday: number): number {
  return Math.max(0, Math.min(ILLUSTRATE_PER_SWEEP, perDay - startedToday))
}

/** The receipt subject of a story's picture; one story is drawn at most once. */
export const illustrationSubject = (storyId: number) => `stories:${storyId}`

export type ReceiptState = { subject: string | null; status: string; attempts: number }

/**
 * Stories that must not be drawn (again): a picture was drawn before (the site owner may have
 * taken it off since, which is final), or the call failed every attempt it gets.
 */
export function alreadyTried(receipts: ReceiptState[], maxAttempts: number): Set<string> {
  return new Set(
    receipts
      .filter((receipt) => receipt.subject && (receipt.status === 'succeeded' || (receipt.status === 'failed' && receipt.attempts >= maxAttempts)))
      .map((receipt) => receipt.subject as string),
  )
}
