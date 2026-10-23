import { isLocale, type Locale } from '@/i18n/config'

/**
 * Reviews (docs/specs/apps.md「评价」): the limits, input checks and shapes shared by the API,
 * the detail page and the back office. No server imports, so the page's own code can use it.
 */
export const reviewRules = {
  /** Characters (code points) in a review. */
  maxBody: 1000,
  /** Characters in the name shown next to a member's reviews. */
  maxName: 30,
  /** New reviews a member can write per Shanghai day; editing one does not count. */
  dailyLimit: 5,
  /** The average shows from this many reviews on; fewer show only the count. */
  averageFrom: 5,
  /** Reviews per request, newest first. */
  pageSize: 10,
  /** Paid machine translations of one review per Shanghai day; editing it again after that waits a day. */
  dailyTranslations: 5,
} as const

export const reviewStatuses = ['shown', 'hidden'] as const
export type ReviewStatus = (typeof reviewStatuses)[number]

/** The languages the model translates reviews into (docs/specs/apps.md 5c); zh-Hant is converted from zh-Hans. */
export const modelLocales = ['en', 'zh-Hans', 'ja', 'ko'] as const satisfies readonly Locale[]
export type ModelLocale = (typeof modelLocales)[number]

/** A review's machine translations as stored: never in the review's own language. */
export type TranslatedTexts = Partial<Record<ModelLocale, string>>

export const translationStatuses = ['done', 'failed'] as const
export type TranslationStatus = (typeof translationStatuses)[number]

export const reportReasons = ['spam', 'abuse', 'offTopic', 'other'] as const
export type ReportReason = (typeof reportReasons)[number]

const maxId = 2 ** 31 - 1

/** A Payload or table id from a query string or a JSON body: a whole number from 1 up. */
export function parseId(value: unknown): number | null {
  const id = typeof value === 'string' && /^[1-9]\d{0,9}$/.test(value) ? Number(value) : value
  return typeof id === 'number' && Number.isInteger(id) && id >= 1 && id <= maxId ? id : null
}

// Control characters other than tab and line feed, zero-width spaces and direction marks, overrides
// and isolates. Zero-width joiners stay: emoji sequences need them.
const invisible = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u200b\u200e\u200f\u202a-\u202e\u2060-\u2064\u2066-\u2069\ufeff]/gu

/** A review as it is kept: line breaks stay, invisible characters go, blank lines fold to one. */
export function cleanText(value: string): string {
  return value
    .replace(/\r\n?/g, '\n')
    .replace(invisible, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Length as readers count it: one per character, emoji and CJK included. */
export function textLength(value: string): number {
  return [...value].length
}

/** One line of text: invisible characters go, runs of white space (line breaks too) fold to one space. */
export function cleanLine(value: string): string {
  return value.replace(invisible, '').replace(/\s+/gu, ' ').trim()
}

/** A member's name as reviews show it: one line, at most `maxName` characters; '' when they have none. */
export function cleanName(value: string): string {
  return [...cleanLine(value)].slice(0, reviewRules.maxName).join('')
}

export type ReviewInput = { app: number; rating: number; body: string; locale: Locale }

export type ReviewInputError = 'invalid-app' | 'invalid-rating' | 'empty-body' | 'body-too-long' | 'invalid-locale'

/** POST /api/reviews { app, rating, body, locale }: the page's language helps tell the review's own. */
export function parseReviewInput(input: unknown): { ok: true; value: ReviewInput } | { ok: false; error: ReviewInputError } {
  const fields = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  const app = parseId(fields.app)
  if (!app) return { ok: false, error: 'invalid-app' }
  const rating = fields.rating
  if (typeof rating !== 'number' || !Number.isInteger(rating) || rating < 1 || rating > 5) {
    return { ok: false, error: 'invalid-rating' }
  }
  const body = typeof fields.body === 'string' ? cleanText(fields.body) : ''
  if (!body) return { ok: false, error: 'empty-body' }
  if (textLength(body) > reviewRules.maxBody) return { ok: false, error: 'body-too-long' }
  if (!isLocale(fields.locale)) return { ok: false, error: 'invalid-locale' }
  return { ok: true, value: { app, rating, body, locale: fields.locale } }
}

/** POST /api/reviews/report { review, reason }. */
export function parseReportInput(input: unknown): { review: number; reason: ReportReason } | null {
  const fields = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  const review = parseId(fields.review)
  const reason = fields.reason
  if (!review || typeof reason !== 'string' || !(reportReasons as readonly string[]).includes(reason)) return null
  return { review, reason: reason as ReportReason }
}

export type ReviewSummary = {
  /** Reviews readers can see. */
  count: number
  /** Stars, one decimal; null under `averageFrom` reviews. */
  average: number | null
}

export function summarize(count: number, totalStars: number): ReviewSummary {
  const average = count >= reviewRules.averageFrom ? Math.round((totalStars / count) * 10) / 10 : null
  return { count, average }
}

/** One review as pages get it. The author is a name and a tile tone, never an id or an email. */
export type ReviewView = {
  id: number
  rating: number
  body: string
  /** The language it is written in: a site locale, or `und`. */
  lang: string
  author: { name: string; tone: number }
  createdAt: string
  editedAt: string | null
  /** A machine translation into the page's language can be read: GET /api/reviews/translation. */
  translatable: boolean
}

/** The member's own review, which they see even when the site owner has hidden it. */
export type OwnReview = ReviewView & { hidden: boolean }

/** GET /api/reviews?app=12[&before=345] */
export type ReviewsPage = {
  signedIn: boolean
  summary: ReviewSummary
  mine: OwnReview | null
  /** Everyone else's, newest first. */
  reviews: ReviewView[]
  /** Pass as `before` for the next page; null when this was the last. */
  next: number | null
}

/** GET /api/reviews/translation?review=345&locale=ja: the review in the page's language, by machine. */
export type ReviewTranslation = { review: number; locale: Locale; text: string }

export type ReviewsError =
  | ReviewInputError
  | 'cross-site'
  | 'sign-in'
  | 'not-found'
  | 'not-translated'
  | 'daily-limit'
  | 'own-review'
  | 'invalid-request'
