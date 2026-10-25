/**
 * Reads for the model usage page (docs/specs/foundation.md「后台 · 模型用量」): totals from
 * `model_receipts`, the calls that need a person, and what each of those calls was about.
 */
import { and, desc, eq, gte, inArray, lt, or, sql } from '@payloadcms/db-postgres/drizzle'
import type { Payload } from 'payload'

import { dailyBudgetUsd, MAX_ATTEMPTS, STALE_AFTER_MS } from '@/lib/ai/limits'
import { modelReceipts as t } from '@/lib/ai/schema'
import { getDb } from '@/lib/db/drizzle'
import { shanghaiDayStart } from '@/lib/shanghai-day'
import { collectEnabled, dailyEmailEnabled, modelCallsEnabled } from '@/lib/switches'
import { appReviews } from '@/modules/apps/schema'
import { rawItems } from '@/modules/daily/schema'

import {
  budgetOf,
  DAY_ROWS,
  lastDays,
  parseSubject,
  PROBLEM_DAYS,
  PROBLEM_LIMIT,
  purposeRows,
  shortError,
  type Budget,
  type DayTotals,
  type Period,
  type PurposeRow,
  type Subject,
} from './rules'

type Env = Record<string, string | undefined>
const DAY_MS = 24 * 60 * 60 * 1000

/** A call to look at: failed and not yet succeeded since, or started and never finished. */
export type Problem = {
  id: number
  purpose: string
  model: string
  status: 'failed' | 'stuck'
  attempts: number
  /** Out of automatic attempts: someone has to start it again where it came from. */
  exhausted: boolean
  error: string
  fullError: string
  at: string
  about: About | null
}

/** A problem's subject as a label and, when there is one, where to look at it. */
export type About = { kind: Subject['kind']; id: number; title: string | null; href: string | null; external: boolean }

export type ModelUsage = {
  today: Budget & { succeeded: number; failed: number }
  switches: { modelCalls: boolean; collect: boolean; dailyEmail: boolean; apiKey: boolean; localBaseUrl: boolean }
  days: DayTotals[]
  period: Period
  purposes: PurposeRow[]
  problems: { total: number; items: Problem[] }
}

const shanghaiDay = sql<string>`to_char(${t.completedAt} at time zone 'Asia/Shanghai', 'YYYY-MM-DD')`
const succeeded = sql<string>`count(*) filter (where ${t.status} = 'succeeded')`
const failed = sql<string>`count(*) filter (where ${t.status} = 'failed')`
const cost = sql<string>`coalesce(sum(${t.costUsd}), 0)`

/** The start of the Shanghai day `days - 1` days before today: a period of `days` calendar days. */
const periodStart = (now: Date, days: number) => new Date(shanghaiDayStart(now).getTime() - (days - 1) * DAY_MS)

/**
 * Everything the page shows. `adminRoute` is Payload's admin path (normally /admin);
 * `locale` picks the language of story and Skill titles.
 */
export async function loadModelUsage({
  period,
  adminRoute,
  locale,
  now = new Date(),
  env = process.env,
}: {
  period: Period
  adminRoute: string
  locale: 'zh-Hans' | 'en'
  now?: Date
  env?: Env
}): Promise<ModelUsage> {
  const { payload, db } = await getDb()

  const [dayRows, purposeTotals, problemRows, [problemCount]] = await Promise.all([
    db
      .select({ date: shanghaiDay, succeeded, failed, costUsd: cost })
      .from(t)
      .where(gte(t.completedAt, periodStart(now, DAY_ROWS)))
      .groupBy(shanghaiDay),
    db
      .select({
        purpose: t.purpose,
        succeeded,
        failed,
        inputTokens: sql<string>`coalesce(sum(${t.inputTokens}) filter (where ${t.status} = 'succeeded'), 0)`,
        outputTokens: sql<string>`coalesce(sum(${t.outputTokens}) filter (where ${t.status} = 'succeeded'), 0)`,
        costUsd: cost,
      })
      .from(t)
      .where(gte(t.completedAt, periodStart(now, period)))
      .groupBy(t.purpose),
    db
      .select({
        id: t.id,
        purpose: t.purpose,
        model: t.model,
        subject: t.subject,
        status: t.status,
        attempts: t.attempts,
        error: t.error,
        updatedAt: t.updatedAt,
      })
      .from(t)
      .where(problemsSince(now))
      .orderBy(desc(t.updatedAt), desc(t.id))
      .limit(PROBLEM_LIMIT),
    db.select({ count: sql<string>`count(*)` }).from(t).where(problemsSince(now)),
  ])

  const days = lastDays(
    dayRows.map((row) => ({ date: row.date, succeeded: Number(row.succeeded), failed: Number(row.failed), costUsd: Number(row.costUsd) })),
    now,
  )
  const today = days[0]
  const abouts = await describeSubjects(
    payload,
    db,
    problemRows.map((row) => parseSubject(row.subject)),
    adminRoute,
    locale,
  )

  return {
    today: { ...budgetOf(today.costUsd, dailyBudgetUsd(env)), succeeded: today.succeeded, failed: today.failed },
    switches: {
      modelCalls: modelCallsEnabled(env),
      collect: collectEnabled(env),
      dailyEmail: dailyEmailEnabled(env),
      apiKey: Boolean(env.OPENROUTER_API_KEY?.trim()),
      localBaseUrl: Boolean(env.OPENROUTER_BASE_URL?.trim()),
    },
    days,
    period,
    purposes: purposeRows(
      purposeTotals.map((row) => ({
        purpose: row.purpose,
        succeeded: Number(row.succeeded),
        failed: Number(row.failed),
        inputTokens: Number(row.inputTokens),
        outputTokens: Number(row.outputTokens),
        costUsd: Number(row.costUsd),
      })),
      env,
    ),
    problems: {
      total: Number(problemCount?.count ?? 0),
      items: problemRows.map((row, index) => ({
        id: row.id,
        purpose: row.purpose,
        model: row.model,
        status: row.status === 'failed' ? 'failed' : 'stuck',
        attempts: row.attempts,
        exhausted: row.status === 'failed' && row.attempts >= MAX_ATTEMPTS,
        error: shortError(row.error),
        fullError: row.error ?? '',
        at: row.updatedAt.toISOString(),
        about: abouts[index],
      })),
    },
  }
}

/** Failed in the last 30 days and not succeeded since, or pending past the point a retry takes over. */
function problemsSince(now: Date) {
  return or(
    and(eq(t.status, 'failed'), gte(t.updatedAt, periodStart(now, PROBLEM_DAYS))),
    and(eq(t.status, 'pending'), lt(t.updatedAt, new Date(now.getTime() - STALE_AFTER_MS))),
  )
}

type Db = Awaited<ReturnType<typeof getDb>>['db']

const idsOf = (subjects: (Subject | null)[], kind: Subject['kind']) => [
  ...new Set(subjects.filter((subject): subject is Subject => subject?.kind === kind).map((subject) => subject.id)),
]

/**
 * Titles and admin links for the subjects, in one query per kind. A report the judge was
 * working on links to its story when it became one, otherwise to the original article.
 */
async function describeSubjects(
  payload: Payload,
  db: Db,
  subjects: (Subject | null)[],
  adminRoute: string,
  locale: 'zh-Hans' | 'en',
): Promise<(About | null)[]> {
  const storyIds = idsOf(subjects, 'stories')
  const itemIds = idsOf(subjects, 'raw_items')
  const reviewIds = idsOf(subjects, 'app_reviews')
  const versionIds = idsOf(subjects, 'skill-versions')

  const [reviews, items, versions] = await Promise.all([
    reviewIds.length ? db.select({ id: appReviews.id, appId: appReviews.appId }).from(appReviews).where(inArray(appReviews.id, reviewIds)) : [],
    itemIds.length ? db.select({ id: rawItems.id, title: rawItems.title, url: rawItems.url }).from(rawItems).where(inArray(rawItems.id, itemIds)) : [],
    versionIds.length
      ? payload
          .find({ collection: 'skill-versions', where: { id: { in: versionIds } }, depth: 1, locale, limit: versionIds.length, pagination: false })
          .then((result) => result.docs)
      : [],
  ])
  const appIds = [...new Set([...idsOf(subjects, 'apps'), ...reviews.map((review) => review.appId)])]

  const [stories, apps] = await Promise.all([
    storyIds.length || itemIds.length
      ? payload
          .find({
            collection: 'stories',
            where: {
              or: [
                ...(storyIds.length ? [{ id: { in: storyIds } }] : []),
                ...(itemIds.length ? [{ representativeItemId: { in: itemIds } }] : []),
              ],
            },
            depth: 0,
            locale,
            limit: storyIds.length + itemIds.length,
            pagination: false,
            select: { title: true, representativeItemId: true },
          })
          .then((result) => result.docs)
      : [],
    appIds.length
      ? payload
          .find({ collection: 'apps', where: { id: { in: appIds } }, depth: 0, limit: appIds.length, pagination: false, select: { name: true } })
          .then((result) => result.docs)
      : [],
  ])

  const storyById = new Map(stories.map((story) => [Number(story.id), story]))
  const storyByItem = new Map(stories.map((story) => [Number(story.representativeItemId), story]))
  const appById = new Map(apps.map((app) => [Number(app.id), app]))
  const appByReview = new Map(reviews.map((review) => [review.id, appById.get(review.appId)]))
  const itemById = new Map(items.map((item) => [item.id, item]))
  const versionById = new Map(versions.map((version) => [Number(version.id), version]))

  const collection = (slug: string, id: number | string) => `${adminRoute}/collections/${slug}/${id}`
  const review = (id: number | string) => `${adminRoute}/collections/stories/review?story=${id}`

  return subjects.map((subject): About | null => {
    if (!subject) return null
    const about = (title: string | null, href: string | null, external = false): About => ({ ...subject, title, href, external })
    switch (subject.kind) {
      case 'stories': {
        const story = storyById.get(subject.id)
        return about(story?.title ?? null, story ? review(subject.id) : null)
      }
      case 'raw_items': {
        const story = storyByItem.get(subject.id)
        if (story) return about(story.title ?? null, review(story.id))
        // The article address came from a feed: link it only when it is plain http(s).
        const item = itemById.get(subject.id)
        const url = item && /^https?:\/\//i.test(item.url) ? item.url : null
        return about(item?.title ?? null, url, true)
      }
      case 'apps': {
        const app = appById.get(subject.id)
        return about(app?.name ?? null, app ? collection('apps', subject.id) : null)
      }
      case 'app_reviews': {
        const app = appByReview.get(subject.id)
        return about(app?.name ?? null, app ? collection('apps', app.id) : null)
      }
      case 'skill-versions': {
        const version = versionById.get(subject.id)
        if (!version) return about(null, null)
        const skill = typeof version.skill === 'object' ? version.skill : null
        return about([skill?.name, version.version].filter(Boolean).join(' '), collection('skill-versions', subject.id))
      }
      case 'arena-answers':
        // The answer's page names its question and model; a deleted one has nowhere to go.
        return about(null, collection('arena-answers', subject.id))
    }
  })
}
