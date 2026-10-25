import { defaultLocale, isLocale, type Locale } from '@/i18n/config'
import { cleanLine, textLength } from '@/modules/apps/reviews/rules'

/**
 * Profiles, following, blocking and reporting members (docs/specs/circles.md rules 18–24): the
 * limits, input checks and shapes shared by the API, the pages and the settings form. No server
 * imports, so the page's own code can use it.
 */
export const profileRules = {
  /** Characters in an address (rule 18). */
  minHandle: 3,
  maxHandle: 20,
  /** Days between a member's own changes of address; the first change does not wait. */
  handleChangeDays: 30,
  /** Characters (code points) in the line about oneself. */
  maxBio: 80,
  /** Characters in the address of one's site. */
  maxWebsite: 200,
  /** New follows per Shanghai day; unfollowing does not count. */
  dailyFollows: 200,
  /** People one member can follow at most. */
  maxFollowing: 2000,
  /** People per page in the followers and following lists. */
  peoplePageSize: 30,
  /** 「值得关注的人」(rule 21): at most this many, so many at a time, from posts of this many days. */
  suggestions: 12,
  suggestionsShown: 4,
  suggestionDays: 30,
  /** Reviews per page on a profile. */
  reviewsPageSize: 20,
  /** People listed under「屏蔽的人」in the settings, the latest first. */
  blockedListed: 500,
} as const

/**
 * Addresses nobody can take (rule 18): the site's own paths and words that would pass for IFAI
 * speaking. Addresses starting with `ifai` are kept back too, and those starting with `u-` are
 * the ones IFAI gives.
 */
const reservedHandles = new Set([
  'about',
  'account',
  'accounts',
  'admin',
  'administrator',
  'api',
  'apps',
  'circles',
  'contact',
  'daily',
  'help',
  'home',
  'legal',
  'login',
  'logout',
  'me',
  'mod',
  'moderator',
  'news',
  'null',
  'official',
  'privacy',
  'rankings',
  'recommend',
  'resources',
  'root',
  'search',
  'security',
  'settings',
  'sign-in',
  'sign-out',
  'sign-up',
  'signin',
  'signup',
  'skills',
  'staff',
  'support',
  'system',
  'team',
  'terms',
  'undefined',
  'wiki',
  'www',
])

const handleShape = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/** The addresses IFAI gives: `u-` and ten hex digits (./handles.ts). */
export const generatedHandlePattern = /^u-[0-9a-f]{10}$/

export type HandleError = 'invalid-handle' | 'reserved-handle'

/** An address as a member types it: trimmed and in lowercase. */
export function normalizeHandle(value: string): string {
  return value.trim().toLowerCase()
}

/** Whether an address has the shape of one (rule 18): 3–20 lowercase letters, digits and single inner hyphens. */
export function isHandle(value: string): boolean {
  return value.length >= profileRules.minHandle && value.length <= profileRules.maxHandle && handleShape.test(value)
}

/** An address a member chose (rule 18), lowercased: its shape, then the words and beginnings kept back. */
export function checkHandle(value: unknown): { ok: true; handle: string } | { ok: false; error: HandleError } {
  const handle = typeof value === 'string' ? normalizeHandle(value) : ''
  if (!isHandle(handle)) return { ok: false, error: 'invalid-handle' }
  if (reservedHandles.has(handle) || handle.startsWith('ifai') || handle.startsWith('u-')) return { ok: false, error: 'reserved-handle' }
  return { ok: true, handle }
}

/** A profile's page, without the language prefix. */
export const profilePath = (handle: string) => `/u/${handle}` as const

/** The lists of the people who follow a member and whom they follow. */
export const peopleSides = ['followers', 'following'] as const
export type PeopleSide = (typeof peopleSides)[number]

export const peoplePath = (handle: string, side: PeopleSide) => `/u/${handle}/${side}` as const

/** The tabs on a member's page (?tab=); 收藏 on one's own page is a link to「我的收藏」. */
export const profileTabs = ['posts', 'reviews', 'circles'] as const
export type ProfileTab = (typeof profileTabs)[number]

/** ?tab= on a member's page: 动态 when it is missing or not a tab. */
export function parseProfileTab(value: unknown): ProfileTab {
  return typeof value === 'string' && (profileTabs as readonly string[]).includes(value) ? (value as ProfileTab) : 'posts'
}

/** ?before= in the lists and the reviews: a positive whole number, or null. */
export function parseBefore(value: unknown): number | null {
  if (typeof value !== 'string' || !/^[1-9][0-9]{0,15}$/.test(value)) return null
  const number = Number(value)
  return Number.isSafeInteger(number) ? number : null
}

/**
 * The language a member's page is in, for its canonical address: the one their line about
 * themselves is written in; English without a line or when it is in none of the site's (like a post's page).
 */
export function profileLocale(profile: Pick<ProfileView, 'bio' | 'bioLang'>): Locale {
  return profile.bio && isLocale(profile.bioLang) ? profile.bioLang : defaultLocale
}

/** The day a member can change their address again, or null when they can now (the first change never waits). */
export function nextHandleChange(changedAt: Date | null, now = new Date()): Date | null {
  if (!changedAt) return null
  const next = new Date(changedAt.getTime() + profileRules.handleChangeDays * 24 * 60 * 60 * 1000)
  return next > now ? next : null
}

/** The line about oneself as it is kept: one line, no invisible characters, like a name (rule 19). */
export function cleanBio(value: string): string {
  return cleanLine(value)
}

/**
 * The address of a member's site (rule 19): http(s) only, `https://` added when they left it out,
 * no user name or password, a host with a dot in it. An empty one clears it.
 */
export function parseWebsite(value: unknown): { ok: true; value: string | null } | { ok: false } {
  if (value === null || value === undefined) return { ok: true, value: null }
  if (typeof value !== 'string') return { ok: false }
  const text = cleanLine(value)
  if (!text) return { ok: true, value: null }
  if (text.length > profileRules.maxWebsite) return { ok: false }
  let url: URL
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`)
  } catch {
    return { ok: false }
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return { ok: false }
  if (url.username || url.password) return { ok: false }
  const host = url.hostname
  if (!host.includes('.') || host.startsWith('.') || host.endsWith('.') || host.startsWith('[')) return { ok: false }
  return url.href.length > profileRules.maxWebsite ? { ok: false } : { ok: true, value: url.href }
}

/** A site as the profile shows it: the host and the path, without the scheme or a closing slash. */
export function websiteLabel(href: string): string {
  try {
    const url = new URL(href)
    let path = url.pathname.replace(/\/+$/, '')
    try {
      path = decodeURI(path)
    } catch {
      // Left encoded.
    }
    return `${url.host}${path}`
  } catch {
    return href
  }
}

/** Whole days since a member signed up, counting the first: 「来 IFAI N 天」. */
export function daysSince(since: Date, now = new Date()): number {
  return Math.max(1, Math.ceil((now.getTime() - since.getTime()) / (24 * 60 * 60 * 1000)))
}

export type ProfileInput = {
  /** Only the fields sent change. */
  handle?: string
  bio?: string
  website?: string | null
  locale: Locale
}

export type ProfileInputError = HandleError | 'bio-too-long' | 'invalid-website' | 'invalid-locale' | 'invalid-request'

/**
 * PATCH /api/account/profile { handle?, bio?, website?, locale }: the page's language helps tell
 * the line's own. The address is only checked for its shape here: sending the one a member has
 * (one IFAI gave them, say) changes nothing, and the words kept back apply to new ones (./data.ts).
 */
export function parseProfileInput(input: unknown): { ok: true; value: ProfileInput } | { ok: false; error: ProfileInputError } {
  if (!input || typeof input !== 'object') return { ok: false, error: 'invalid-request' }
  const fields = input as Record<string, unknown>
  if (!isLocale(fields.locale)) return { ok: false, error: 'invalid-locale' }
  const value: ProfileInput = { locale: fields.locale }
  if (fields.handle !== undefined) {
    const handle = typeof fields.handle === 'string' ? normalizeHandle(fields.handle) : ''
    if (!isHandle(handle)) return { ok: false, error: 'invalid-handle' }
    value.handle = handle
  }
  if (fields.bio !== undefined) {
    if (typeof fields.bio !== 'string' && fields.bio !== null) return { ok: false, error: 'invalid-request' }
    const bio = cleanBio(fields.bio ?? '')
    if (textLength(bio) > profileRules.maxBio) return { ok: false, error: 'bio-too-long' }
    value.bio = bio
  }
  if (fields.website !== undefined) {
    const website = parseWebsite(fields.website)
    if (!website.ok) return { ok: false, error: 'invalid-website' }
    value.website = website.value
  }
  return { ok: true, value }
}

/** POST /api/follows/members and /api/account/blocks { handle, on }: any case, as in an address bar. */
export function parseHandleSwitch(input: unknown): { handle: string; on: boolean } | null {
  const fields = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  const handle = typeof fields.handle === 'string' ? normalizeHandle(fields.handle) : ''
  if (!isHandle(handle) || typeof fields.on !== 'boolean') return null
  return { handle, on: fields.on }
}

/**
 * 「值得关注的人」(rule 21): the most people who reacted to or commented on their posts first, then
 * the most posts, then the latest; never the reader or someone they follow.
 */
export function rankSuggestions<T extends { userId: string; people: number; posts: number; lastPost: number }>(
  candidates: T[],
  { exclude, limit = profileRules.suggestions }: { exclude: ReadonlySet<string>; limit?: number },
): T[] {
  return candidates
    .filter((candidate) => !exclude.has(candidate.userId))
    .sort((a, b) => b.people - a.people || b.posts - a.posts || b.lastPost - a.lastPost)
    .slice(0, limit)
}

/** Someone with a page on IFAI, as links to it show them: never their id or email. */
export type PersonLink = { name: string; tone: number; handle: string }

/** A person in the followers and following lists. */
export type PersonRow = PersonLink & {
  bio: string
  /** The language the line is written in: a site locale, or `und`. */
  bioLang: string | null
  /** The reader follows them. */
  following: boolean
  /** It is the reader. */
  self: boolean
  /** One of them blocked the other (rule 23): no「关注」. */
  blocked: boolean
}

/** A profile's top half. */
export type ProfileView = PersonLink & {
  bio: string
  bioLang: string | null
  website: string | null
  joinedAt: string
}

/** 「值得关注的人」. */
export type SuggestedPerson = PersonLink & {
  /** Where they posted most in the last 30 days. */
  circle: number | null
  followers: number
}

/** The settings form's fields, as saved. */
export type ProfileSettings = {
  handle: string
  bio: string
  website: string | null
  /** When the address can change again; null when it can now. */
  nextChange: string | null
}

/** POST /api/follows/members: whether the reader follows them now, and how many people do. */
export type FollowChange = { following: boolean; followers: number }

/** Who blocked whom between the reader and a member (rule 23), if either did: `mine` when it was the reader. */
export type BlockState = 'mine' | 'theirs' | null

/** Someone under「屏蔽的人」in the settings. */
export type BlockedPerson = PersonLink & { blockedAt: string }

/** POST /api/account/blocks: whether the reader blocks them now. */
export type BlockChange = { blocked: boolean }

/** Why a reader reports a member (rule 24). */
export const memberReportReasons = ['impersonation', 'profile', 'spam', 'abuse', 'other'] as const
export type MemberReportReason = (typeof memberReportReasons)[number]

export const isMemberReportReason = (value: unknown): value is MemberReportReason =>
  typeof value === 'string' && (memberReportReasons as readonly string[]).includes(value)

/**
 * What the site owner does about a reported member (rule 24): any of the three at once, or keep
 * them as they are when the reports were wrong. Either way their open reports are dealt with.
 */
export type MemberReportAction = { clearProfile: boolean; resetHandle: boolean; resetName: boolean } | { keep: true }

/** POST /api/circles/member-reports/:userId: three booleans with at least one of them on, or { keep: true }. */
export function parseMemberReportAction(input: unknown): MemberReportAction | null {
  const fields = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  if (fields.keep === true) return { keep: true }
  const flag = (name: string) => fields[name] === true
  const action = { clearProfile: flag('clearProfile'), resetHandle: flag('resetHandle'), resetName: flag('resetName') }
  return action.clearProfile || action.resetHandle || action.resetName ? action : null
}

export type ProfilesError =
  | ProfileInputError
  | 'cross-site'
  | 'sign-in'
  | 'not-found'
  | 'handle-taken'
  | 'handle-too-soon'
  | 'own-profile'
  | 'daily-limit'
  | 'too-many'
  | 'blocked'
