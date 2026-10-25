import { defaultLocale, isLocale, localePrefixes, type Locale } from '@/i18n/config'
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

/**
 * Pictures and video links in posts (docs/specs/circles.md rules 12 and 13). The page shrinks a
 * picture before sending it; the server turns it upright, drops its metadata and keeps WebP copies.
 */
export const mediaRules = {
  /** Pictures in one post. */
  maxImages: 9,
  /** Bytes the page sends per picture: Vercel takes 4.5 MB a request. */
  maxUploadBytes: 4 * 1024 * 1024,
  /** Bytes of a file the reader picks; anything but a GIF is shrunk first. */
  maxPickedBytes: 20 * 1024 * 1024,
  /** The longest side the page shrinks photos to, and the longest the server keeps. */
  maxSide: 2048,
  /** Width × height the server opens at most. */
  maxPixels: 50_000_000,
  /** Pictures a member can upload per Shanghai day (ten posts of nine). */
  dailyImages: 90,
  /** Video links a member can look up per Shanghai day; links someone looked up already are free. */
  dailyVideos: 30,
} as const

/** Comments (docs/specs/circles.md rule 15): one level of replies, text cleaned and counted like posts. */
export const commentRules = {
  /** Characters (code points) in a comment. */
  maxBody: 500,
  /** Comments a member can write per Shanghai day; one they deleted no longer counts. */
  dailyComments: 50,
  /** Comments on the post per request, newest first. */
  pageSize: 20,
  /** Replies under a comment before「展开其余 N 条回复」, oldest first. */
  repliesShown: 3,
  /** Replies per request once a comment's are opened. */
  repliesPageSize: 50,
} as const

/** Cards for apps and Skills on IFAI that a post links to (rule 17): at most this many. */
export const maxLinkCards = 3

/** The picture types a post takes, as the page and the server see them. */
export const imageTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const

export const videoProviders = ['youtube', 'bilibili', 'vimeo'] as const
export type VideoProvider = (typeof videoProviders)[number]

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

/** 推荐 (the default), 最新, 关注 (people the reader follows, step 4), 我的圈子. */
export const feedTabs = ['hot', 'latest', 'following', 'mine'] as const
export type FeedTab = (typeof feedTabs)[number]

/** Inside one circle: 关注 and 我的圈子 span every circle, so only these two. */
export const circleTabs = ['hot', 'latest'] as const satisfies readonly FeedTab[]

/** The tab shown for the one asked: inside a circle, 推荐 stands in for the two it has not. */
export function shownTab(asked: FeedTab, inCircle: boolean): FeedTab {
  return inCircle && !(circleTabs as readonly FeedTab[]).includes(asked) ? 'hot' : asked
}

export function parseTab(value: unknown): FeedTab | null {
  if (value === null || value === undefined || value === '') return 'hot'
  return typeof value === 'string' && (feedTabs as readonly string[]).includes(value) ? (value as FeedTab) : null
}

/** The seven tile tones of the design tokens (src/components/cards/initial-tile.tsx), 0–6. */
export const circleTones = [0, 1, 2, 3, 4, 5, 6] as const

/**
 * 「推荐」: how a post from the last `hotDays` days ranks, from the people who reacted to it and
 * the people who commented on it (its author aside, each person once, so a flood of comments
 * does not lift it), fading with age. Mirrors the SQL in ./data.ts.
 */
export function hotScore({ people, commenters = 0, hours }: { people: number; commenters?: number; hours: number }): number {
  return (people + 2 * commenters + 1) / Math.pow(Math.max(hours, 0) + 2, 1.5)
}

/** The busiest circles today, for their「热议」badge: at most `hotCircles`, each with `hotFrom` posts or more. */
export function hotCircleIds(today: { id: number; today: number }[]): number[] {
  return today
    .filter((circle) => circle.today >= circleRules.hotFrom)
    .sort((a, b) => b.today - a.today || a.id - b.id)
    .slice(0, circleRules.hotCircles)
    .map((circle) => circle.id)
}

export type PostInput = { circle: number; body: string; locale: Locale; images: number[]; video: number | null }

export type PostInputError =
  | 'invalid-circle'
  | 'empty-body'
  | 'body-too-long'
  | 'invalid-locale'
  | 'too-many-images'
  | 'invalid-images'
  | 'invalid-video'

/**
 * POST /api/circles/posts { circle, body, locale, images?, video? }: the page's language helps
 * tell the post's own. `images` are ids from POST /api/circles/images in the order they show,
 * `video` an id from POST /api/circles/videos; with either, the text can be left empty.
 */
export function parsePostInput(input: unknown): { ok: true; value: PostInput } | { ok: false; error: PostInputError } {
  const fields = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  const circle = parseId(fields.circle)
  if (!circle) return { ok: false, error: 'invalid-circle' }
  const images = fields.images ?? []
  if (!Array.isArray(images)) return { ok: false, error: 'invalid-images' }
  const imageIds = images.map(parseId)
  if (imageIds.some((id) => id === null) || new Set(imageIds).size !== imageIds.length) return { ok: false, error: 'invalid-images' }
  if (imageIds.length > mediaRules.maxImages) return { ok: false, error: 'too-many-images' }
  const video = fields.video === undefined || fields.video === null ? null : parseId(fields.video)
  if (video === null && fields.video !== undefined && fields.video !== null) return { ok: false, error: 'invalid-video' }
  const body = typeof fields.body === 'string' ? cleanText(fields.body) : ''
  if (!body && imageIds.length === 0 && video === null) return { ok: false, error: 'empty-body' }
  if (textLength(body) > circleRules.maxBody) return { ok: false, error: 'body-too-long' }
  if (!isLocale(fields.locale)) return { ok: false, error: 'invalid-locale' }
  return { ok: true, value: { circle, body, locale: fields.locale, images: imageIds as number[], video } }
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

/** What a reader can report: a post, or a comment under one. */
export type ReportTarget = { kind: 'post' | 'comment'; id: number }

/** POST /api/circles/report { post, reason } or { comment, reason }. */
export function parseReportInput(input: unknown): { target: ReportTarget; reason: ReportReason } | null {
  const fields = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  const reason = fields.reason
  if (typeof reason !== 'string' || !(reportReasons as readonly string[]).includes(reason)) return null
  if (fields.post !== undefined && fields.comment !== undefined) return null
  const post = parseId(fields.post)
  const comment = parseId(fields.comment)
  const target: ReportTarget | null = post ? { kind: 'post', id: post } : comment ? { kind: 'comment', id: comment } : null
  return target && { target, reason: reason as ReportReason }
}

export type CommentInput = { post: number; body: string; locale: Locale; replyTo: number | null }

export type CommentInputError = 'invalid-post' | 'empty-body' | 'body-too-long' | 'invalid-locale' | 'invalid-reply'

/**
 * POST /api/circles/comments { post, body, locale, replyTo? }: `replyTo` is the comment or reply
 * being answered; the page's language helps tell the comment's own, as for posts.
 */
export function parseCommentInput(input: unknown): { ok: true; value: CommentInput } | { ok: false; error: CommentInputError } {
  const fields = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  const post = parseId(fields.post)
  if (!post) return { ok: false, error: 'invalid-post' }
  const answered = fields.replyTo === undefined || fields.replyTo === null ? null : parseId(fields.replyTo)
  if (answered === null && fields.replyTo !== undefined && fields.replyTo !== null) return { ok: false, error: 'invalid-reply' }
  const body = typeof fields.body === 'string' ? cleanText(fields.body) : ''
  if (!body) return { ok: false, error: 'empty-body' }
  if (textLength(body) > commentRules.maxBody) return { ok: false, error: 'body-too-long' }
  if (!isLocale(fields.locale)) return { ok: false, error: 'invalid-locale' }
  return { ok: true, value: { post, body, locale: fields.locale, replyTo: answered } }
}

/** Someone shown on IFAI: a name (empty when they have none) and a tile tone, never an id or an email. */
export type PersonView = { name: string; tone: number }

/** Who wrote a post or a comment, with the address of their page (docs/specs/circles.md rule 18). */
export type AuthorView = PersonView & { handle: string | null }

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

/** A picture in a post: its three sizes (rule 12) and its shape, for the grid and the viewer. */
export type PostImage = {
  id: number
  /** 400 px, cropped square: the grid. */
  square: string
  /** Up to 800 px on the long side: a post's only picture. */
  feed: string
  /** Up to 2048 px: the viewer. */
  full: string
  width: number
  height: number
}

/** A video link as cards show it. Without a title nothing could be read about it, and the card is a plain link. */
export type VideoView = {
  id: number
  provider: VideoProvider
  /** The video's own page. */
  url: string
  /** The site's player, loaded only once the reader presses play. */
  embed: string
  title: string | null
  channel: string | null
  /** Seconds, when the site says. */
  duration: number | null
  /** Kept on IFAI, so showing it asks nothing of the video site. */
  cover: string | null
}

/** Text in the language it is written in, when that is known: app names are the same in every language. */
export type LinkText = { value: string; lang?: string }

/** A card for an app or a Skill on IFAI that a post links to (rule 17). */
export type LinkCard =
  | {
      kind: 'app'
      slug: string
      name: string
      tagline: LinkText | null
      logo: { url: string; width: number | null; height: number | null } | null
    }
  | { kind: 'skill'; slug: string; name: LinkText; author: string; installs: number }

export type PostView = {
  id: number
  circle: number
  /** Can be empty when the post has pictures or a video. */
  body: string
  /** The language it is written in: a site locale, or `und`. */
  lang: string
  author: AuthorView
  /** The reader follows its author (rule 20). */
  following: boolean
  /** The reader wrote it: they can delete it, not report it. */
  mine: boolean
  /** The site owner hid it; only its author gets it, with a note. */
  hidden: boolean
  createdAt: string
  /** By how many people, most first; the picker's order breaks ties. */
  reactions: ReactionView[]
  /** None on a hidden post: its pictures are no longer public. */
  images: PostImage[]
  video: VideoView | null
  /** Comments and replies everyone can see (rule 15). */
  comments: number
  /** The apps and Skills on IFAI it links to, as cards; filled in by ./link-cards.ts. */
  links: LinkCard[]
}

export type CommentView = {
  id: number
  post: number
  /** The comment it is listed under; null for a comment on the post itself. */
  parent: number | null
  /** Whom it answers when that is a reply rather than the comment it is under:「回复 林栖」. */
  replyTo: PersonView | null
  body: string
  /** The language it is written in: a site locale, or `und`. */
  lang: string
  author: AuthorView
  /** The reader wrote it: they can delete it, not report it. */
  mine: boolean
  /** The site owner hid it; only its author gets it, with a note, and nobody can answer it. */
  hidden: boolean
  createdAt: string
}

/** A comment on the post with its first replies. */
export type CommentThread = CommentView & {
  replies: CommentView[]
  /** All the replies the reader can see under it, the ones in `replies` included. */
  replyCount: number
}

/** GET /api/circles/comments?post=45[&cursor=…] */
export type CommentsPage = {
  signedIn: boolean
  /** Comments and replies everyone can see. */
  count: number
  comments: CommentThread[]
  /** Pass as `cursor` for the next page; null when this was the last. */
  next: number | null
}

/** GET /api/circles/comments?post=45&thread=12[&cursor=…] */
export type RepliesPage = { replies: CommentView[]; next: number | null }

/** POST /api/circles/comments; DELETE answers with the count alone. */
export type CommentChange = { comment: CommentView; count: number }

/** GET /api/circles/feed?tab=latest[&circle=3][&cursor=…], or ?author=linqi for one member's page. */
export type FeedPage = {
  signedIn: boolean
  posts: PostView[]
  /** Pass as `cursor` for the next page; null when this was the last. */
  next: number | null
  /** On the first page only: the circles' numbers and the reader's circles. */
  overview?: CirclesOverview
  joined?: number[]
  /** On the first page of 关注: how many people the reader follows, for what the empty feed says. */
  follows?: number
}

/** POST /api/circles/posts, POST /api/circles/members, DELETE /api/circles/posts. */
export type CirclesChange = {
  overview: CirclesOverview
  joined: number[]
  post?: PostView
}

export type CirclesError =
  | PostInputError
  | CommentInputError
  | 'cross-site'
  | 'sign-in'
  | 'not-found'
  | 'daily-limit'
  | 'own-post'
  | 'invalid-request'
  | 'too-large'
  | 'invalid-image'
  | 'unsupported-video'
  | 'own-comment'

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

/** A post or a comment on one line, cut to `length` characters (code points) with「…」: page titles, the back office. */
export function excerpt(body: string, length = 60): string {
  const characters = [...body.replace(/\s+/gu, ' ').trim()]
  return characters.length > length ? `${characters.slice(0, length).join('')}…` : characters.join('')
}

/** A post's page, without the language prefix. */
export const postPath = (id: number) => `/circles/p/${id}` as const

/**
 * The language a post's page is canonical in: the one it is written in, English when that is not
 * one of the site's. The same post under another prefix is not another page (no hreflang).
 */
export function postLocale(post: Pick<PostView, 'lang'>): Locale {
  return isLocale(post.lang) ? post.lang : defaultLocale
}

/**
 * The values for the `circles.postTitle` message, the post page's title and its share sheet's:
 *「林栖：正文的前 30 个字」, or「林栖在 # AI 绘画 发的动态」when the post has only pictures or a video.
 */
export function postTitleValues(post: Pick<PostView, 'body'>, name: string, circle: string) {
  return { name, circle, excerpt: excerpt(post.body, 30), text: post.body.trim() ? 'yes' : 'no' }
}

export type SiteLink = { kind: 'app' | 'skill'; slug: string }

const slugGroup = '([a-z0-9]+(?:-[a-z0-9]+)*)'
const localePrefix = `(?:${Object.values(localePrefixes).join('|')})?`
const appPath = new RegExp(`^${localePrefix}/apps/${slugGroup}/?$`)
const skillPath = new RegExp(`^${localePrefix}/resources/skills/${slugGroup}(?:/v/[^/]+)?/?$`)

/** Site links looked up per post: a few more than the cards, for links to apps that are not listed. */
const maxSiteLinks = 10

/**
 * The apps and Skills on IFAI a post links to (rule 17), in the order they come, each once: an
 * app's page or a Skill's (any version of it), with or without the language prefix. `origin` is
 * the site's own (src/lib/site-url.ts); links to anywhere else stay plain links.
 */
export function siteLinks(body: string, origin: string): SiteLink[] {
  let host: string
  try {
    host = new URL(origin).host
  } catch {
    return []
  }
  const found: SiteLink[] = []
  const seen = new Set<string>()
  for (const part of linkify(body)) {
    if (!('href' in part)) continue
    const url = new URL(part.href)
    if (url.host !== host) continue
    const app = appPath.exec(url.pathname)
    const skill = app ? null : skillPath.exec(url.pathname)
    const link: SiteLink | null = app ? { kind: 'app', slug: app[1] } : skill ? { kind: 'skill', slug: skill[1] } : null
    if (!link || seen.has(`${link.kind}:${link.slug}`)) continue
    seen.add(`${link.kind}:${link.slug}`)
    found.push(link)
    if (found.length === maxSiteLinks) break
  }
  return found
}
