import type { PostgresAdapter } from '@payloadcms/db-postgres'
import { desc, eq, inArray } from '@payloadcms/db-postgres/drizzle'
import { createTranslator } from 'next-intl'
import type { Payload } from 'payload'

import { localizePath, messagesFileName, type Locale } from '@/i18n/config'
import type { ReportReason, ReviewStatus, TranslatedTexts, TranslationStatus } from '@/modules/apps/reviews/rules'
import { appReviewReports, appReviews, appReviewTranslations } from '@/modules/apps/schema'
import { normalizeEmail } from '@/modules/daily/email/address'
import { imageViews } from '@/modules/circles/media/images'
import { videoViews } from '@/modules/circles/media/videos'
import type { PostStatus, Reaction, ReportReason as PostReportReason, VideoProvider } from '@/modules/circles/rules'
import { circleMembers, circlePostReactions, circlePostReports, circlePosts } from '@/modules/circles/schema'
import { emailSends, type EmailSendStatus } from '@/modules/daily/email/schema'
import { listHref, storyHref, topicHref } from '@/modules/daily/public/list-params'
import { isStoryTag } from '@/modules/daily/tags'
import { readTopicNames } from '@/modules/daily/topic-names'
import { follows } from '@/modules/follows/schema'
import { followId, type FollowType } from '@/modules/follows/target'
import { skillHref } from '@/modules/resources/public/list-params'
import { saves } from '@/modules/saves/schema'
import type { SaveType } from '@/modules/saves/target'
import type { AppReport, AppSubmission, SkillSubmission, Subscriber } from '@/payload-types'

import { authAccounts, authSessions, authUsers } from './schema'

/**
 * 「下载我的数据」(docs/specs/foundation.md「导出我的数据」): everything IFAI keeps about a
 * member, as one JSON file. It reads the same tables ./delete-member.ts and the foreign keys
 * delete, plus the daily email subscription of a verified sign-in email. Fields are picked one
 * by one, so sign-in tokens and the owner's internal notes never reach the file, and neither
 * does anyone else's data (the text of a review they reported). A table that starts to hold a
 * member's data belongs here as well as in the deletion.
 */

/** Something on IFAI the data points at: its name in the page language and, while readers can open it, its address. */
export type ExportRef = { id: number; name: string | null; url: string | null }

export type MemberExport = {
  /** One sentence in the page language: whose data, when, and where the privacy policy explains it. */
  about: string
  exportedAt: string
  site: string
  account: {
    id: string
    email: string
    emailVerified: boolean
    name: string
    image: string | null
    interfaceLanguage: string | null
    createdAt: string
    updatedAt: string
  }
  /** Google and GitHub sign-ins linked to the account. */
  linkedAccounts: { provider: string; accountId: string; scope: string | null; linkedAt: string }[]
  /** Sign-in sessions, newest first; `current` is the one the export was made from. */
  sessions: { signedInAt: string; expiresAt: string; ipAddress: string | null; userAgent: string | null; current: boolean }[]
  saves: { type: SaveType; id: number; name: string | null; url: string | null; savedAt: string }[]
  /** Industry tags and companies or products (by topic key) the member follows, newest first. */
  follows: { type: FollowType; key: string; name: string | null; url: string | null; followedAt: string }[]
  reviews: {
    id: number
    app: ExportRef
    rating: number
    text: string
    language: string
    status: ReviewStatus
    writtenAt: string
    editedAt: string | null
    /** The machine translations of the review as it reads now, by language. */
    machineTranslations: TranslatedTexts | null
  }[]
  /** Reviews by others that the member reported: which one and why, not its text or author. */
  reviewReports: { review: number; app: ExportRef; reason: ReportReason; reportedAt: string; resolvedAt: string | null }[]
  appReports: {
    id: number
    app: ExportRef | null
    kind: AppReport['kind']
    details: string | null
    contact: string | null
    pageLanguage: string | null
    status: AppReport['status']
    reportedAt: string
    resolvedAt: string | null
  }[]
  appSubmissions: {
    code: string | null
    name: string
    website: string
    category: ExportRef | null
    note: string | null
    contactEmail: string
    emailLanguage: string | null
    status: AppSubmission['status']
    app: ExportRef | null
    replyFromIFAI: string | null
    submittedAt: string
    lastEmail: { status: string; sentAt: string | null } | null
  }[]
  skillSubmissions: {
    code: string | null
    repository: string
    note: string | null
    contactEmail: string
    emailLanguage: string | null
    status: SkillSubmission['status']
    skill: ExportRef | null
    replyFromIFAI: string | null
    submittedAt: string
    lastEmail: { status: string; sentAt: string | null } | null
  }[]
  /** The circles the member joined, newest first. */
  circles: { circle: ExportRef; joinedAt: string }[]
  /** Their posts in circles, newest first, hidden ones too (a hidden post's pictures no longer open). */
  circlePosts: {
    id: number
    circle: ExportRef
    text: string
    language: string
    status: PostStatus
    images: string[]
    video: { site: VideoProvider; url: string; title: string | null } | null
    postedAt: string
  }[]
  /** Their reactions to posts: on which post, not its text or author. */
  circleReactions: { post: number; circle: ExportRef; reaction: Reaction; reactedAt: string }[]
  /** Posts by others the member reported: which one and why, not its text or author. */
  circlePostReports: { post: number; circle: ExportRef; reason: PostReportReason; reportedAt: string; resolvedAt: string | null }[]
  /** The daily email subscription of the sign-in email, when it is verified and subscribed at some point. */
  dailyEmail: {
    email: string
    status: Subscriber['status']
    stopReason: string | null
    language: string
    timeZone: string
    subscribedAt: string | null
    unsubscribedAt: string | null
    subscribedFrom: string | null
    welcomeSentAt: string | null
    lastSentAt: string | null
    /** The morning emails, newest first, by the subscriber's own date. */
    emails: { date: string; language: string; status: EmailSendStatus; stories: number | null; sentAt: string | null }[]
  } | null
}

/** The member's rows as read, before `shapeMemberExport` picks what goes in the file. */
export type MemberRecords = {
  user: {
    id: string
    email: string
    emailVerified: boolean
    name: string
    image: string | null
    uiLocale: string | null
    createdAt: Date
    updatedAt: Date
  }
  accounts: { providerId: string; accountId: string; scope: string | null; createdAt: Date }[]
  sessions: { id: string; createdAt: Date; expiresAt: Date; ipAddress: string | null; userAgent: string | null }[]
  saves: { targetType: SaveType; targetId: number; createdAt: Date }[]
  follows: { targetType: FollowType; targetKey: string; createdAt: Date }[]
  reviews: {
    id: number
    appId: number
    rating: number
    body: string
    lang: string
    status: ReviewStatus
    editedAt: Date | null
    createdAt: Date
  }[]
  translations: { reviewId: number; source: string; status: TranslationStatus; texts: TranslatedTexts }[]
  reviewReports: { reviewId: number; appId: number; reason: ReportReason; createdAt: Date; resolvedAt: Date | null }[]
  appReports: AppReport[]
  appSubmissions: AppSubmission[]
  skillSubmissions: SkillSubmission[]
  circleMembers: { circleId: number; createdAt: Date }[]
  circlePosts: {
    id: number
    circleId: number
    body: string
    lang: string
    status: PostStatus
    createdAt: Date
    /** Picture addresses as Payload gives them, in order. */
    images: string[]
    video: { provider: VideoProvider; url: string; title: string | null } | null
  }[]
  circleReactions: { postId: number; circleId: number; reaction: Reaction; createdAt: Date }[]
  circlePostReports: { postId: number; circleId: number; reason: PostReportReason; createdAt: Date; resolvedAt: Date | null }[]
  subscriber: Subscriber | null
  sends: { localDate: string; locale: string; status: EmailSendStatus; storyCount: number | null; sentAt: Date | null }[]
}

type Lookup = (payload: Payload, ids: number[], locale: Locale, site: string) => Promise<ExportRef[]>

const link = (site: string, locale: Locale, path: `/${string}`) => `${site}${localizePath(locale, path)}`

/**
 * How the file names each kind of thing: one per save type (a new save type does not compile
 * until it has one), plus app categories, daily stories and circles. Deleted things are left out
 * and keep only their id.
 */
const lookups = {
  app: async (payload, ids, locale, site) => {
    const { docs } = await payload.find({
      collection: 'apps',
      where: { id: { in: ids } },
      select: { name: true, slug: true, status: true },
      depth: 0,
      pagination: false,
      overrideAccess: true,
      locale,
    })
    // Only published apps have a page; a delisted one is a 404.
    return docs.map((app) => ({ id: app.id, name: app.name, url: app.status === 'published' ? link(site, locale, `/apps/${app.slug}`) : null }))
  },
  skill: async (payload, ids, locale, site) => {
    const { docs } = await payload.find({
      collection: 'skills',
      where: { id: { in: ids } },
      select: { name: true, slug: true, status: true },
      depth: 0,
      pagination: false,
      overrideAccess: true,
      locale,
    })
    // A delisted Skill keeps its page, which says why.
    const open = new Set(['published', 'delisted'])
    return docs.map((skill) => ({ id: skill.id, name: skill.name, url: open.has(skill.status) ? link(site, locale, skillHref(skill.slug)) : null }))
  },
  category: async (payload, ids, locale, site) => {
    const { docs } = await payload.find({
      collection: 'app-categories',
      where: { id: { in: ids } },
      select: { name: true, slug: true },
      depth: 0,
      pagination: false,
      overrideAccess: true,
      locale,
    })
    return docs.map((category) => ({ id: category.id, name: category.name, url: link(site, locale, `/apps/category/${category.slug}`) }))
  },
  story: async (payload, ids, locale, site) => {
    const { docs } = await payload.find({
      collection: 'stories',
      where: { id: { in: ids } },
      select: { title: true, slug: true, status: true },
      depth: 0,
      pagination: false,
      overrideAccess: true,
      locale,
    })
    // Pending, withdrawn and merged stories have no page.
    return docs.map((story) => ({ id: story.id, name: story.title, url: story.status === 'published' ? link(site, locale, storyHref(story.slug)) : null }))
  },
  circle: async (payload, ids, locale, site) => {
    const { docs } = await payload.find({
      collection: 'circles',
      where: { id: { in: ids } },
      select: { name: true, slug: true, shown: true },
      depth: 0,
      pagination: false,
      overrideAccess: true,
      locale,
    })
    // A circle the owner took down has no page of its own.
    return docs.map((circle) => ({ id: circle.id, name: circle.name, url: circle.shown ? link(site, locale, `/circles?circle=${circle.slug}`) : null }))
  },
} satisfies Record<SaveType, Lookup> & Record<string, Lookup>

type RefKind = keyof typeof lookups
export type ExportRefs = Record<RefKind, Map<number, ExportRef>>

/** Names and addresses of what the member follows, by follow id (`tag-agents`, `topic-kimi`). */
export type FollowRefs = Map<string, { name: string | null; url: string | null }>

/** A relationship read at depth 0: the id, or the document when something populated it. */
function idOf(value: number | { id: number } | null | undefined): number | null {
  if (value == null) return null
  return typeof value === 'number' ? value : value.id
}

const iso = (date: Date) => date.toISOString()
const isoOrNull = (date: Date | null | undefined) => (date ? date.toISOString() : null)

/** Reads the member's rows; null when there is no such member (the account is gone). */
export async function readMemberRecords(payload: Payload, userId: string): Promise<MemberRecords | null> {
  const { drizzle: db } = payload.db as unknown as PostgresAdapter
  const [user] = await db
    .select({
      id: authUsers.id,
      email: authUsers.email,
      emailVerified: authUsers.emailVerified,
      name: authUsers.name,
      image: authUsers.image,
      uiLocale: authUsers.uiLocale,
      createdAt: authUsers.createdAt,
      updatedAt: authUsers.updatedAt,
    })
    .from(authUsers)
    .where(eq(authUsers.id, userId))
    .limit(1)
  if (!user) return null

  // Reports keep the reporter as `u:<member id>` (src/app/api/app-reports/new, src/app/api/reviews/report).
  const reporter = `u:${userId}`
  const collection = { sort: '-createdAt', depth: 0, pagination: false, overrideAccess: true } as const
  const [
    accounts,
    sessions,
    saveRows,
    followRows,
    reviews,
    reviewReports,
    appReports,
    appSubmissions,
    skillSubmissions,
    memberships,
    posts,
    postReactions,
    postReports,
    subscribers,
  ] = await Promise.all([
    db
      .select({ providerId: authAccounts.providerId, accountId: authAccounts.accountId, scope: authAccounts.scope, createdAt: authAccounts.createdAt })
      .from(authAccounts)
      .where(eq(authAccounts.userId, userId))
      .orderBy(authAccounts.createdAt),
    db
      .select({
        id: authSessions.id,
        createdAt: authSessions.createdAt,
        expiresAt: authSessions.expiresAt,
        ipAddress: authSessions.ipAddress,
        userAgent: authSessions.userAgent,
      })
      .from(authSessions)
      .where(eq(authSessions.userId, userId))
      .orderBy(desc(authSessions.createdAt)),
    db
      .select({ targetType: saves.targetType, targetId: saves.targetId, createdAt: saves.createdAt })
      .from(saves)
      .where(eq(saves.userId, userId))
      .orderBy(desc(saves.createdAt), desc(saves.id)),
    db
      .select({ targetType: follows.targetType, targetKey: follows.targetKey, createdAt: follows.createdAt })
      .from(follows)
      .where(eq(follows.userId, userId))
      .orderBy(desc(follows.createdAt), desc(follows.id)),
    db
      .select({
        id: appReviews.id,
        appId: appReviews.appId,
        rating: appReviews.rating,
        body: appReviews.body,
        lang: appReviews.lang,
        status: appReviews.status,
        editedAt: appReviews.editedAt,
        createdAt: appReviews.createdAt,
      })
      .from(appReviews)
      .where(eq(appReviews.userId, userId))
      .orderBy(desc(appReviews.createdAt)),
    db
      .select({
        reviewId: appReviewReports.reviewId,
        appId: appReviews.appId,
        reason: appReviewReports.reason,
        createdAt: appReviewReports.createdAt,
        resolvedAt: appReviewReports.resolvedAt,
      })
      .from(appReviewReports)
      .innerJoin(appReviews, eq(appReviews.id, appReviewReports.reviewId))
      .where(eq(appReviewReports.reporter, reporter))
      .orderBy(desc(appReviewReports.createdAt)),
    payload.find({ collection: 'app-reports', where: { reporter: { equals: reporter } }, ...collection }),
    payload.find({ collection: 'app-submissions', where: { submitterId: { equals: userId } }, ...collection }),
    payload.find({ collection: 'skill-submissions', where: { submitterId: { equals: userId } }, ...collection }),
    db
      .select({ circleId: circleMembers.circleId, createdAt: circleMembers.createdAt })
      .from(circleMembers)
      .where(eq(circleMembers.userId, userId))
      .orderBy(desc(circleMembers.createdAt)),
    db
      .select({
        id: circlePosts.id,
        circleId: circlePosts.circleId,
        body: circlePosts.body,
        lang: circlePosts.lang,
        status: circlePosts.status,
        videoId: circlePosts.videoId,
        createdAt: circlePosts.createdAt,
      })
      .from(circlePosts)
      .where(eq(circlePosts.userId, userId))
      .orderBy(desc(circlePosts.createdAt), desc(circlePosts.id)),
    db
      .select({
        postId: circlePostReactions.postId,
        circleId: circlePosts.circleId,
        reaction: circlePostReactions.reaction,
        createdAt: circlePostReactions.createdAt,
      })
      .from(circlePostReactions)
      .innerJoin(circlePosts, eq(circlePosts.id, circlePostReactions.postId))
      .where(eq(circlePostReactions.userId, userId))
      .orderBy(desc(circlePostReactions.createdAt), desc(circlePostReactions.id)),
    // Posts are reported as `u:<member id>` too (src/app/api/circles/report).
    db
      .select({
        postId: circlePostReports.postId,
        circleId: circlePosts.circleId,
        reason: circlePostReports.reason,
        createdAt: circlePostReports.createdAt,
        resolvedAt: circlePostReports.resolvedAt,
      })
      .from(circlePostReports)
      .innerJoin(circlePosts, eq(circlePosts.id, circlePostReports.postId))
      .where(eq(circlePostReports.reporter, reporter))
      .orderBy(desc(circlePostReports.createdAt)),
    // The subscription is by address, not by account: only an address the member has shown is theirs.
    user.emailVerified
      ? payload.find({ collection: 'subscribers', where: { email: { equals: normalizeEmail(user.email) } }, depth: 0, limit: 1, overrideAccess: true })
      : Promise.resolve({ docs: [] as Subscriber[] }),
  ])

  const reviewIds = reviews.map((review) => review.id)
  const subscriber = subscribers.docs[0] ?? null
  const [translations, sends, { byPost: postImages }, videos] = await Promise.all([
    reviewIds.length
      ? db
          .select({
            reviewId: appReviewTranslations.reviewId,
            source: appReviewTranslations.source,
            status: appReviewTranslations.status,
            texts: appReviewTranslations.texts,
          })
          .from(appReviewTranslations)
          .where(inArray(appReviewTranslations.reviewId, reviewIds))
      : Promise.resolve([]),
    subscriber
      ? db
          .select({
            localDate: emailSends.localDate,
            locale: emailSends.locale,
            status: emailSends.status,
            storyCount: emailSends.storyCount,
            sentAt: emailSends.sentAt,
          })
          .from(emailSends)
          .where(eq(emailSends.subscriberId, subscriber.id))
          .orderBy(desc(emailSends.localDate))
      : Promise.resolve([]),
    imageViews(payload, { postIds: posts.map((post) => post.id), coverIds: [] }),
    videoViews(payload, [...new Set(posts.flatMap((post) => (post.videoId ? [post.videoId] : [])))]),
  ])

  return {
    user,
    accounts,
    sessions,
    saves: saveRows,
    follows: followRows,
    reviews,
    translations,
    reviewReports,
    appReports: appReports.docs,
    appSubmissions: appSubmissions.docs,
    skillSubmissions: skillSubmissions.docs,
    circleMembers: memberships,
    circlePosts: posts.map(({ videoId, ...post }) => {
      const video = videoId ? videos.get(videoId) : undefined
      return {
        ...post,
        images: (postImages.get(post.id) ?? []).map((image) => image.full),
        video: video ? { provider: video.provider, url: video.url, title: video.title } : null,
      }
    }),
    circleReactions: postReactions,
    circlePostReports: postReports,
    subscriber,
    sends,
  }
}

/** Names and addresses for every app, Skill, category and circle the records point at, in the page language. */
export async function readExportRefs(payload: Payload, records: MemberRecords, locale: Locale, site: string): Promise<ExportRefs> {
  const kinds = Object.keys(lookups) as RefKind[]
  const wanted = Object.fromEntries(kinds.map((kind) => [kind, new Set<number>()])) as Record<RefKind, Set<number>>
  const want = (kind: RefKind, id: number | null) => {
    if (id !== null) wanted[kind].add(id)
  }
  for (const save of records.saves) want(save.targetType, save.targetId)
  for (const review of records.reviews) want('app', review.appId)
  for (const report of records.reviewReports) want('app', report.appId)
  for (const report of records.appReports) want('app', idOf(report.app))
  for (const submission of records.appSubmissions) {
    want('app', idOf(submission.app))
    want('category', idOf(submission.category))
  }
  for (const submission of records.skillSubmissions) want('skill', idOf(submission.skill))
  for (const row of [...records.circleMembers, ...records.circlePosts, ...records.circleReactions, ...records.circlePostReports]) want('circle', row.circleId)

  const found = await Promise.all(
    kinds.map(async (kind) => {
      const ids = [...wanted[kind]]
      const refs = ids.length > 0 ? await lookups[kind](payload, ids, locale, site) : []
      return [kind, new Map(refs.map((ref) => [ref.id, ref]))] as const
    }),
  )
  return Object.fromEntries(found) as ExportRefs
}

/**
 * Names and addresses of the followed tags (in the page language) and companies and products (as
 * their newest published story writes them); a company no published story is about now keeps
 * only its key.
 */
export async function readFollowRefs(
  payload: Payload,
  records: MemberRecords,
  { locale, site, tagName }: { locale: Locale; site: string; tagName: (tag: string) => string },
): Promise<FollowRefs> {
  const { drizzle: db } = payload.db as unknown as PostgresAdapter
  const keys = records.follows.filter((row) => row.targetType === 'topic').map((row) => row.targetKey)
  const topics = await readTopicNames(db, keys)
  const refs: FollowRefs = new Map()
  for (const { targetType: type, targetKey: key } of records.follows) {
    const id = followId({ type, key })
    if (type === 'tag') refs.set(id, isStoryTag(key) ? { name: tagName(key), url: link(site, locale, listHref({ tag: key })) } : { name: null, url: null })
    else {
      const topic = topics.get(key)
      refs.set(id, topic ? { name: topic.name, url: link(site, locale, topicHref(key)) } : { name: null, url: null })
    }
  }
  return refs
}

/** The file's contents: only the fields listed here, whatever else the records carry. */
export function shapeMemberExport(
  records: MemberRecords,
  refs: ExportRefs,
  {
    about,
    site,
    sessionId,
    now,
    followRefs = new Map(),
  }: { about: string; site: string; sessionId: string | null; now: Date; followRefs?: FollowRefs },
): MemberExport {
  const ref = (kind: RefKind, id: number): ExportRef => refs[kind].get(id) ?? { id, name: null, url: null }
  const optionalRef = (kind: RefKind, id: number | null): ExportRef | null => (id === null ? null : ref(kind, id))
  const translations = new Map(records.translations.map((row) => [row.reviewId, row]))
  const lastEmail = (status: string | null | undefined, sentAt: string | null | undefined) => (status ? { status, sentAt: sentAt ?? null } : null)
  const { user, subscriber } = records

  return {
    about,
    exportedAt: now.toISOString(),
    site,
    account: {
      id: user.id,
      email: user.email,
      emailVerified: user.emailVerified,
      name: user.name,
      image: user.image ?? null,
      interfaceLanguage: user.uiLocale ?? null,
      createdAt: iso(user.createdAt),
      updatedAt: iso(user.updatedAt),
    },
    linkedAccounts: records.accounts.map((account) => ({
      provider: account.providerId,
      accountId: account.accountId,
      scope: account.scope ?? null,
      linkedAt: iso(account.createdAt),
    })),
    sessions: records.sessions.map((session) => ({
      signedInAt: iso(session.createdAt),
      expiresAt: iso(session.expiresAt),
      ipAddress: session.ipAddress ?? null,
      userAgent: session.userAgent ?? null,
      current: session.id === sessionId,
    })),
    saves: records.saves.map((save) => {
      const { name, url } = ref(save.targetType, save.targetId)
      return { type: save.targetType, id: save.targetId, name, url, savedAt: iso(save.createdAt) }
    }),
    follows: records.follows.map((row) => {
      const { name, url } = followRefs.get(followId({ type: row.targetType, key: row.targetKey })) ?? { name: null, url: null }
      return { type: row.targetType, key: row.targetKey, name, url, followedAt: iso(row.createdAt) }
    }),
    reviews: records.reviews.map((review) => {
      const translation = translations.get(review.id)
      // Translations of earlier wording no longer match the review, and are not shown anywhere.
      const current = translation?.status === 'done' && translation.source === review.body && Object.keys(translation.texts).length > 0
      return {
        id: review.id,
        app: ref('app', review.appId),
        rating: review.rating,
        text: review.body,
        language: review.lang,
        status: review.status,
        writtenAt: iso(review.createdAt),
        editedAt: isoOrNull(review.editedAt),
        machineTranslations: current ? { ...translation.texts } : null,
      }
    }),
    reviewReports: records.reviewReports.map((report) => ({
      review: report.reviewId,
      app: ref('app', report.appId),
      reason: report.reason,
      reportedAt: iso(report.createdAt),
      resolvedAt: isoOrNull(report.resolvedAt),
    })),
    appReports: records.appReports.map((report) => ({
      id: report.id,
      app: optionalRef('app', idOf(report.app)),
      kind: report.kind,
      details: report.body ?? null,
      contact: report.contact ?? null,
      pageLanguage: report.pageLocale ?? null,
      status: report.status,
      reportedAt: report.createdAt,
      resolvedAt: report.resolvedAt ?? null,
    })),
    appSubmissions: records.appSubmissions.map((submission) => ({
      code: submission.code ?? null,
      name: submission.name,
      website: submission.website,
      category: optionalRef('category', idOf(submission.category)),
      note: submission.note ?? null,
      contactEmail: submission.email,
      emailLanguage: submission.locale ?? null,
      status: submission.status,
      app: optionalRef('app', idOf(submission.app)),
      replyFromIFAI: submission.reply ?? null,
      submittedAt: submission.createdAt,
      lastEmail: lastEmail(submission.notifiedStatus, submission.notifiedAt),
    })),
    skillSubmissions: records.skillSubmissions.map((submission) => ({
      code: submission.code ?? null,
      repository: submission.repository,
      note: submission.note ?? null,
      contactEmail: submission.email,
      emailLanguage: submission.locale ?? null,
      status: submission.status,
      skill: optionalRef('skill', idOf(submission.skill)),
      replyFromIFAI: submission.reply ?? null,
      submittedAt: submission.createdAt,
      lastEmail: lastEmail(submission.notifiedStatus, submission.notifiedAt),
    })),
    circles: records.circleMembers.map((membership) => ({ circle: ref('circle', membership.circleId), joinedAt: iso(membership.createdAt) })),
    circlePosts: records.circlePosts.map((post) => ({
      id: post.id,
      circle: ref('circle', post.circleId),
      text: post.body,
      language: post.lang,
      status: post.status,
      images: post.images.map((url) => new URL(url, site).toString()),
      video: post.video && { site: post.video.provider, url: post.video.url, title: post.video.title },
      postedAt: iso(post.createdAt),
    })),
    circleReactions: records.circleReactions.map((reaction) => ({
      post: reaction.postId,
      circle: ref('circle', reaction.circleId),
      reaction: reaction.reaction,
      reactedAt: iso(reaction.createdAt),
    })),
    circlePostReports: records.circlePostReports.map((report) => ({
      post: report.postId,
      circle: ref('circle', report.circleId),
      reason: report.reason,
      reportedAt: iso(report.createdAt),
      resolvedAt: isoOrNull(report.resolvedAt),
    })),
    dailyEmail: subscriber
      ? {
          email: subscriber.email,
          status: subscriber.status,
          stopReason: subscriber.stopReason ?? null,
          language: subscriber.locale,
          timeZone: subscriber.timeZone,
          subscribedAt: subscriber.subscribedAt ?? null,
          unsubscribedAt: subscriber.unsubscribedAt ?? null,
          subscribedFrom: subscriber.sourcePage ?? null,
          welcomeSentAt: subscriber.welcomeSentAt ?? null,
          lastSentAt: subscriber.lastSentAt ?? null,
          emails: records.sends.map((send) => ({
            date: send.localDate,
            language: send.locale,
            status: send.status,
            stories: send.storyCount ?? null,
            sentAt: isoOrNull(send.sentAt),
          })),
        }
      : null,
  }
}

/** "2026-10-23 17:05 UTC", for the file's first line. */
function utcMinute(date: Date): string {
  return `${date.toISOString().slice(0, 16).replace('T', ' ')} UTC`
}

/** The member's data as the file holds it; null when the account no longer exists. */
export async function exportMemberData(
  payload: Payload,
  { userId, sessionId, locale, site, now = new Date() }: { userId: string; sessionId: string | null; locale: Locale; site: string; now?: Date },
): Promise<MemberExport | null> {
  const records = await readMemberRecords(payload, userId)
  if (!records) return null
  const messages = (await import(`../../../messages/${messagesFileName(locale)}.json`)).default
  const tags = createTranslator({ locale, messages, namespace: 'tags' })
  const [refs, followRefs] = await Promise.all([
    readExportRefs(payload, records, locale, site),
    readFollowRefs(payload, records, { locale, site, tagName: (tag) => tags(tag as Parameters<typeof tags>[0]) }),
  ])
  const t = createTranslator({ locale, messages, namespace: 'account' })
  const about = t('exportAbout', { email: records.user.email, time: utcMinute(now), url: link(site, locale, '/privacy') })
  return shapeMemberExport(records, refs, { about, site, sessionId, now, followRefs })
}
