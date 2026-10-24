import { isLocale, type Locale } from '@/i18n/config'
import { cleanText, parseId, textLength } from '@/modules/apps/reviews/rules'

export { parseId }

/**
 * Circles (docs/specs/circles.md): the limits, input checks and shapes shared by the API, the
 * circles page and the back office. No server imports, so the page's own code can use it.
 * Text is cleaned and counted the way app reviews are (src/modules/apps/reviews/rules.ts).
 */
export const circleRules = {
  /** Characters (code points) in a post. */
  maxBody: 1000,
  /** Posts a member can publish per Shanghai day; one they deleted no longer counts. */
  dailyPosts: 10,
  /** Posts per request. */
  pageSize: 20,
  /** 「推荐」looks at posts from this many days. */
  hotDays: 7,
  /** 「热议」: the busiest circles today, this many at most… */
  hotCircles: 2,
  /** …with at least this many posts today. */
  hotFrom: 5,
  /** Recent posters shown on a circle's card. */
  recentPosters: 3,
} as const

/** The six reactions, in the order the picker shows them; stored by key, shown as the emoji. */
export const reactions = ['like', 'love', 'insight', 'celebrate', 'eyes', 'rocket'] as const
export type Reaction = (typeof reactions)[number]

export const reactionEmoji: Record<Reaction, string> = {
  like: '👍',
  love: '❤️',
  insight: '💡',
  celebrate: '🎉',
  eyes: '👀',
  rocket: '🚀',
}

export function isReaction(value: unknown): value is Reaction {
  return typeof value === 'string' && (reactions as readonly string[]).includes(value)
}

export const postStatuses = ['shown', 'hidden'] as const
export type PostStatus = (typeof postStatuses)[number]

export const reportReasons = ['spam', 'abuse', 'offTopic', 'other'] as const
export type ReportReason = (typeof reportReasons)[number]

/** 推荐 (the default), 最新, 我的圈子. 关注 comes with following members (step 4). */
export const feedTabs = ['hot', 'latest', 'mine'] as const
export type FeedTab = (typeof feedTabs)[number]

export function parseTab(value: unknown): FeedTab | null {
  if (value === null || value === undefined || value === '') return 'hot'
  return typeof value === 'string' && (feedTabs as readonly string[]).includes(value) ? (value as FeedTab) : null
}

/** The seven tile tones of the design tokens (src/components/cards/initial-tile.tsx), 0–6. */
export const circleTones = [0, 1, 2, 3, 4, 5, 6] as const

/**
 * 「推荐」: how a post from the last `hotDays` days ranks, from the people who reacted to it and
 * its comments (none until step 3), fading with age. Mirrors the SQL in ./data.ts.
 */
export function hotScore({ people, comments = 0, hours }: { people: number; comments?: number; hours: number }): number {
  return (people + 2 * comments + 1) / Math.pow(Math.max(hours, 0) + 2, 1.5)
}

/** The busiest circles today, for their「热议」badge: at most `hotCircles`, each with `hotFrom` posts or more. */
export function hotCircleIds(today: { id: number; today: number }[]): number[] {
  return today
    .filter((circle) => circle.today >= circleRules.hotFrom)
    .sort((a, b) => b.today - a.today || a.id - b.id)
    .slice(0, circleRules.hotCircles)
    .map((circle) => circle.id)
}

export type PostInput = { circle: number; body: string; locale: Locale }

export type PostInputError = 'invalid-circle' | 'empty-body' | 'body-too-long' | 'invalid-locale'

/** POST /api/circles/posts { circle, body, locale }: the page's language helps tell the post's own. */
export function parsePostInput(input: unknown): { ok: true; value: PostInput } | { ok: false; error: PostInputError } {
  const fields = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  const circle = parseId(fields.circle)
  if (!circle) return { ok: false, error: 'invalid-circle' }
  const body = typeof fields.body === 'string' ? cleanText(fields.body) : ''
  if (!body) return { ok: false, error: 'empty-body' }
  if (textLength(body) > circleRules.maxBody) return { ok: false, error: 'body-too-long' }
  if (!isLocale(fields.locale)) return { ok: false, error: 'invalid-locale' }
  return { ok: true, value: { circle, body, locale: fields.locale } }
}

/** POST /api/circles/members { circle, joined }. */
export function parseMembershipInput(input: unknown): { circle: number; joined: boolean } | null {
  const fields = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  const circle = parseId(fields.circle)
  if (!circle || typeof fields.joined !== 'boolean') return null
  return { circle, joined: fields.joined }
}

/** POST /api/circles/reactions { post, reaction, on }. */
export function parseReactionInput(input: unknown): { post: number; reaction: Reaction; on: boolean } | null {
  const fields = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  const post = parseId(fields.post)
  if (!post || !isReaction(fields.reaction) || typeof fields.on !== 'boolean') return null
  return { post, reaction: fields.reaction, on: fields.on }
}

/** POST /api/circles/report { post, reason }. */
export function parseReportInput(input: unknown): { post: number; reason: ReportReason } | null {
  const fields = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  const post = parseId(fields.post)
  const reason = fields.reason
  if (!post || typeof reason !== 'string' || !(reportReasons as readonly string[]).includes(reason)) return null
  return { post, reason: reason as ReportReason }
}

/** Someone shown on IFAI: a name (empty when they have none) and a tile tone, never an id or an email. */
export type PersonView = { name: string; tone: number }

/** A circle as the page shows it; the numbers come from ./data.ts, the rest from the collection. */
export type CircleView = {
  id: number
  slug: string
  name: string
  description: string | null
  tone: number
}

/** A circle's live numbers. */
export type CircleStats = {
  id: number
  /** Members who joined it. */
  members: number
  /** Shown posts in it today (Shanghai day). */
  today: number
  hot: boolean
  /** The last few people who posted in it, newest first. */
  recent: PersonView[]
}

export type CirclesOverview = {
  /** People who posted today (Shanghai day). */
  postersToday: number
  circles: CircleStats[]
}

export type ReactionView = {
  reaction: Reaction
  count: number
  /** The reader is one of them. */
  mine: boolean
  /** Up to two of the others, newest first, for「你、林栖等 12 人」. */
  names: string[]
}

export type PostView = {
  id: number
  circle: number
  body: string
  /** The language it is written in: a site locale, or `und`. */
  lang: string
  author: PersonView
  /** The reader wrote it: they can delete it, not report it. */
  mine: boolean
  /** The site owner hid it; only its author gets it, with a note. */
  hidden: boolean
  createdAt: string
  /** By how many people, most first; the picker's order breaks ties. */
  reactions: ReactionView[]
}

/** GET /api/circles/feed?tab=latest[&circle=3][&cursor=…] */
export type FeedPage = {
  signedIn: boolean
  posts: PostView[]
  /** Pass as `cursor` for the next page; null when this was the last. */
  next: number | null
  /** On the first page only: the circles' numbers and the reader's circles. */
  overview?: CirclesOverview
  joined?: number[]
}

/** POST /api/circles/posts, POST /api/circles/members, DELETE /api/circles/posts. */
export type CirclesChange = {
  overview: CirclesOverview
  joined: number[]
  post?: PostView
}

export type CirclesError =
  | PostInputError
  | 'cross-site'
  | 'sign-in'
  | 'not-found'
  | 'daily-limit'
  | 'own-post'
  | 'invalid-request'

/** The reactions on one post, most people first, the picker's order breaking ties. */
export function sortReactions(list: ReactionView[]): ReactionView[] {
  return list
    .filter((item) => item.count > 0)
    .sort((a, b) => b.count - a.count || reactions.indexOf(a.reaction) - reactions.indexOf(b.reaction))
}

/**
 * One reaction after the reader turns theirs on or off, before the server answers: the count and
 * whether it is theirs change, the others' names stay.
 */
export function toggleReaction(list: ReactionView[], reaction: Reaction, on: boolean): ReactionView[] {
  const existing = list.find((item) => item.reaction === reaction)
  if (!existing) return on ? sortReactions([...list, { reaction, count: 1, mine: true, names: [] }]) : list
  if (existing.mine === on) return list
  const next = { ...existing, mine: on, count: existing.count + (on ? 1 : -1) }
  return sortReactions(list.map((item) => (item.reaction === reaction ? next : item)))
}

const openers: Record<string, string> = { ')': '(', ']': '[' }

const occurrences = (text: string, char: string) => text.split(char).length - 1

/**
 * Addresses in a post become links; the rest stays text. Only http(s). An address ends at the
 * first space or non-ASCII character, so「链接：https://example.com很好用」links only the address
 * (browsers copy addresses percent-encoded), and trailing punctuation is left out.
 */
export function linkify(text: string): ({ text: string } | { href: string; text: string })[] {
  const parts: ({ text: string } | { href: string; text: string })[] = []
  // No `i` flag: with `u` it would fold "k" and "s" into the non-ASCII range.
  const pattern = /[hH][tT][tT][pP][sS]?:\/\/[^\s<>"'`\u{80}-\u{10FFFF}]+/gu
  let last = 0
  for (const match of text.matchAll(pattern)) {
    let url = match[0]
    // A closing bracket belongs to the address only when the address opened it, as in a Wikipedia link.
    while (/[.,;:!?)\]]$/.test(url)) {
      const tail = url.slice(-1)
      const opener = openers[tail]
      if (opener && occurrences(url, opener) >= occurrences(url, tail)) break
      url = url.slice(0, -1)
    }
    const start = match.index ?? 0
    let href: string
    try {
      href = new URL(url).href
    } catch {
      continue
    }
    if (start > last) parts.push({ text: text.slice(last, start) })
    parts.push({ href, text: url })
    last = start + url.length
  }
  if (last < text.length) parts.push({ text: text.slice(last) })
  return parts
}
