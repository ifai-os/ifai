/**
 * Review actions (docs/specs/daily.md「流程」8–9): save the editor's simplified Chinese, publish
 * (rewriting stale languages first), correct, reject, set aside, withdraw, merge into a
 * published story, keep apart, rewrite languages, and the two AI helpers. Each one is a plain
 * function the endpoints call; `deps` lets the local check run with a mock model.
 */
import { and, count, eq, sql } from '@payloadcms/db-postgres/drizzle'
import { z } from 'zod'

import { ai as defaultAi } from '@/lib/ai'
import type { Ai } from '@/lib/ai/client'
import { getDb } from '@/lib/db/drizzle'

import { storyCategories } from '../categories'
import { refreshHeat } from '../heat/heat'
import { parseVideo, storyMediaKinds, videoUrl } from '../media'
import { syncEventSources } from '../heat/sources'
import { sourceRoles } from '../story-fields'
import { assistPrompt, cleanSuggestion, type AssistKind } from '../prompts/assist'
import { rewritePrompt } from '../prompts/rewrite'
import { verifyWriting } from '../write/verify'
import { loadReports, materialOf } from '../write/write'
import { refreshDailyCache } from './cache'
import { loadReviewDetail } from './detail'
import { allTexts, findDuplicates, hansOf, loadStoryAll, localeStatusOf, moreReportsOf, sourcesOf, type Payload, type StoryAll } from './load'
import { eventItems, events, itemAnalyses } from '../schema'
import {
  SUMMARY_MAX,
  TITLE_MAX,
  asVerification,
  hansHash,
  isRewrittenLocale,
  localeStates,
  localesToRewrite,
  textLength,
  type LocaleEntry,
  type LocaleStatus,
  type RewrittenLocale,
} from './rules'
import type { Edits, MergeResult, ReviewDetail, RewriteResult } from './types'

export type ReviewDeps = {
  ai?: Ai
  now?: () => Date
  /** Refreshes the cached pages and feeds; defaults to the Next.js cache tag. */
  refresh?: () => Promise<void>
}

export type ReviewErrorCode =
  | 'not_found'
  | 'bad_request'
  | 'not_publishable'
  | 'not_published'
  | 'not_correctable'
  | 'duplicate_open'
  | 'title_too_long'
  | 'summary_too_long'
  | 'rewrite_failed'
  | 'no_reports'
  | 'bad_target'
  | 'poster_invalid'
  | 'poster_empty'
  | 'render_failed'

/** A refusal the screen explains to the editor; `detail` carries what the message needs. */
export class ReviewError extends Error {
  constructor(
    public code: ReviewErrorCode,
    public status = 400,
    public detail: Record<string, unknown> = {},
  ) {
    super(code)
    this.name = 'ReviewError'
  }
}

const editsSchema = z.object({
  title: z.string().trim().min(1).max(200),
  summary: z.string().trim().min(1).max(1000),
  tryIt: z.string().trim().max(400).default(''),
  category: z.enum(storyCategories),
  sources: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(120),
        role: z.enum(sourceRoles),
        url: z.string().trim().url().max(2000),
        publishedAt: z.string().nullable().optional(),
      }),
    )
    .max(30),
  media: z
    .object({
      kind: z.enum(storyMediaKinds),
      videoUrl: z.string().trim().max(2000).default(''),
      credit: z.string().trim().max(120).default(''),
    })
    .optional(),
})

/** Validates the editor's changes; nothing (undefined) means "no changes sent". */
export function parseEdits(value: unknown): Edits | undefined {
  if (value === undefined || value === null) return undefined
  const parsed = editsSchema.safeParse(value)
  if (!parsed.success) throw new ReviewError('bad_request', 400, { issues: parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`) })
  const media = parsed.data.media ?? { kind: 'none', videoUrl: '', credit: '' }
  if (media.kind === 'video' && !parseVideo(media.videoUrl)) {
    throw new ReviewError('bad_request', 400, { issues: ['media.videoUrl: not a YouTube, Vimeo, .mp4 or .webm address'] })
  }
  return { ...parsed.data, media }
}

async function mustLoad(payload: Payload, id: number): Promise<StoryAll> {
  const story = await loadStoryAll(payload, id)
  if (!story) throw new ReviewError('not_found', 404)
  return story
}

/** Non-localized fields are saved through zh-Hans (always present) without re-running the zh-Hant sync. */
async function patch(payload: Payload, id: number, data: Record<string, unknown>): Promise<void> {
  await payload.update({ collection: 'stories', id, locale: 'zh-Hans', data, context: { skipHantSync: true } })
}

/**
 * Save the simplified Chinese, category and sources. The zh-Hant copy follows through the
 * collection hook, and the source check runs again on the new text.
 */
export async function saveEdits(id: number, edits: Edits | undefined): Promise<void> {
  if (!edits) return
  const { payload } = await getDb()
  const story = await mustLoad(payload, id)
  const reports = await loadReports(story.representativeItemId, story.eventId)
  const hans = { title: edits.title, summary: edits.summary, tryIt: edits.tryIt }
  const verification = reports ? verifyWriting(allTexts(story, hans), materialOf(reports.prompt)) : asVerification(story.verification)
  const video = edits.media.kind === 'video' ? parseVideo(edits.media.videoUrl) : null
  // A picture story without its picture has nothing to show: keep it as no media.
  const kind = edits.media.kind === 'image' && !story.media?.image ? 'none' : edits.media.kind
  const image = typeof story.media?.image === 'object' ? (story.media?.image?.id ?? null) : (story.media?.image ?? null)
  const media = { kind, image, videoUrl: video ? videoUrl(video) : null, credit: edits.media.credit || null }
  await payload.update({
    collection: 'stories',
    id,
    locale: 'zh-Hans',
    data: { ...hans, category: edits.category, sources: edits.sources, media, verification },
  })
}

/**
 * Write the given languages (default: every one that is stale, failed or missing) from the
 * current simplified Chinese. A language that fails is marked failed with the reason and
 * blocks publishing until it is retried.
 */
export async function rewriteLocales(id: number, locales: RewrittenLocale[] | undefined, deps: ReviewDeps = {}): Promise<RewriteResult> {
  const { payload } = await getDb()
  const ai = deps.ai ?? defaultAi
  const now = deps.now?.() ?? new Date()
  const story = await mustLoad(payload, id)
  const hans = hansOf(story)
  const hash = hansHash(hans)
  const status: LocaleStatus = { ...localeStatusOf(story) }
  const targets = locales ?? localesToRewrite(localeStates(status, hash))
  if (!targets.length) return { written: [], failed: [] }
  const reports = await loadReports(story.representativeItemId, story.eventId)
  if (!reports) throw new ReviewError('no_reports', 409)
  const at = now.toISOString()

  try {
    const { output, model } = await ai.object({
      purpose: 'write',
      subject: `stories:${id}`,
      instructions: rewritePrompt.instructions,
      prompt: rewritePrompt.build({ hans, locales: targets, reports: reports.prompt }),
      schema: rewritePrompt.schema(targets),
      temperature: 0.3,
    })
    for (const locale of targets) {
      await payload.update({ collection: 'stories', id, locale, data: output[locale] })
      status[locale] = { status: 'written', at, model, basedOn: hash }
    }
    const fresh = await mustLoad(payload, id)
    const verification = verifyWriting(allTexts(fresh), materialOf(reports.prompt))
    await patch(payload, id, { localeStatus: status, verification })
    return { written: targets, failed: [] }
  } catch (error) {
    if (error instanceof ReviewError) throw error
    const message = error instanceof Error ? error.message : String(error)
    for (const locale of targets) {
      const previous: LocaleEntry | undefined = status[locale]
      status[locale] = { ...previous, status: 'failed', at, error: message.slice(0, 300) }
    }
    await patch(payload, id, { localeStatus: status })
    return { written: [], failed: targets.map((locale) => ({ locale, error: message })) }
  }
}

function checkLengths(story: StoryAll): void {
  const hans = hansOf(story)
  if (textLength(hans.title) > TITLE_MAX) throw new ReviewError('title_too_long', 409, { max: TITLE_MAX })
  if (textLength(hans.summary) > SUMMARY_MAX) throw new ReviewError('summary_too_long', 409, { max: SUMMARY_MAX })
}

async function rewriteOrFail(id: number, deps: ReviewDeps): Promise<void> {
  const result = await rewriteLocales(id, undefined, deps)
  if (result.failed.length) {
    throw new ReviewError('rewrite_failed', 409, { locales: result.failed.map((f) => f.locale), error: result.failed[0].error })
  }
}

/**
 * 通过并发布: save the edits, make sure the other languages match the simplified Chinese
 * (rewriting the stale ones), then publish. The publish time is the approval time.
 */
export async function publishStory(id: number, edits: Edits | undefined, deps: ReviewDeps = {}): Promise<ReviewDetail> {
  const { payload, db } = await getDb()
  const now = deps.now?.() ?? new Date()
  await saveEdits(id, edits)
  const story = await mustLoad(payload, id)
  if (story.status !== 'pending' && story.status !== 'withdrawn') throw new ReviewError('not_publishable', 409, { status: story.status })
  const duplicate = (await findDuplicates(db, payload, [story], now)).get(story.id)
  if (duplicate) throw new ReviewError('duplicate_open', 409, { duplicate })
  checkLengths(story)
  await rewriteOrFail(id, deps)
  await patch(payload, id, { status: 'published', publishedAt: now.toISOString(), laterAt: null })
  await (deps.refresh ?? refreshDailyCache)()
  return (await loadReviewDetail(id, now))!
}

/** 保存更正 on a published story: same as publishing, but keeps the publish time and records the correction. */
export async function correctStory(id: number, edits: Edits | undefined, deps: ReviewDeps = {}): Promise<ReviewDetail> {
  const { payload } = await getDb()
  const now = deps.now?.() ?? new Date()
  const before = await mustLoad(payload, id)
  if (before.status !== 'published') throw new ReviewError('not_correctable', 409, { status: before.status })
  await saveEdits(id, edits)
  checkLengths(await mustLoad(payload, id))
  await rewriteOrFail(id, deps)
  await patch(payload, id, { correctedAt: now.toISOString() })
  await (deps.refresh ?? refreshDailyCache)()
  return (await loadReviewDetail(id, now))!
}

/** 拒绝: the story goes to the archive; the same happening is not queued again. */
export async function rejectStory(id: number, deps: ReviewDeps = {}): Promise<ReviewDetail> {
  const { payload } = await getDb()
  const now = deps.now?.() ?? new Date()
  const story = await mustLoad(payload, id)
  if (story.status !== 'pending' && story.status !== 'withdrawn') throw new ReviewError('not_publishable', 409, { status: story.status })
  await patch(payload, id, { status: 'rejected', laterAt: null })
  return (await loadReviewDetail(id, now))!
}

/** 稍后再看: keep the edits, move the story to the end of the queue. */
export async function laterStory(id: number, edits: Edits | undefined, deps: ReviewDeps = {}): Promise<ReviewDetail> {
  const { payload } = await getDb()
  const now = deps.now?.() ?? new Date()
  await saveEdits(id, edits)
  await patch(payload, id, { laterAt: now.toISOString() })
  return (await loadReviewDetail(id, now))!
}

/** 撤回发布: off the site within a minute; the story comes back to the queue as withdrawn. */
export async function withdrawStory(id: number, deps: ReviewDeps = {}): Promise<ReviewDetail> {
  const { payload } = await getDb()
  const now = deps.now?.() ?? new Date()
  const story = await mustLoad(payload, id)
  if (story.status !== 'published') throw new ReviewError('not_published', 409, { status: story.status })
  await patch(payload, id, { status: 'withdrawn' })
  await (deps.refresh ?? refreshDailyCache)()
  return (await loadReviewDetail(id, now))!
}

/** 不是同一件事: the suggested story is remembered, so that pair is not suggested again either way round. */
export async function keepSeparate(id: number, deps: ReviewDeps = {}): Promise<ReviewDetail> {
  const { payload, db } = await getDb()
  const now = deps.now?.() ?? new Date()
  const story = await mustLoad(payload, id)
  const duplicate = (await findDuplicates(db, payload, [story], now)).get(story.id)
  if (duplicate) await patch(payload, id, { keptApartFrom: duplicate.id })
  return (await loadReviewDetail(id, now))!
}

/**
 * 并入那一条: this report becomes another source of the published story (its event gains
 * the report, the source list gains the publisher) and this story is closed as merged.
 */
export async function mergeStory(id: number, into: number, edits: Edits | undefined, deps: ReviewDeps = {}): Promise<MergeResult> {
  const { payload, db } = await getDb()
  const now = deps.now?.() ?? new Date()
  await saveEdits(id, edits)
  const story = await mustLoad(payload, id)
  if (story.status !== 'pending' && story.status !== 'withdrawn') throw new ReviewError('not_publishable', 409, { status: story.status })
  const target = await loadStoryAll(payload, into)
  if (!target || target.id === story.id || target.status === 'merged' || target.status === 'rejected') throw new ReviewError('bad_target', 409)

  const itemId = story.representativeItemId
  if (story.eventId !== target.eventId) {
    await db.delete(eventItems).where(and(eq(eventItems.itemId, itemId), eq(eventItems.eventId, story.eventId)))
    await db
      .insert(eventItems)
      .values({ eventId: target.eventId, itemId, relation: 'same', newInformation: true, matchedItemId: target.representativeItemId })
      .onConflictDoNothing()
    const [left] = await db.select({ n: count() }).from(eventItems).where(eq(eventItems.eventId, story.eventId))
    if (Number(left?.n ?? 0) === 0) await db.delete(events).where(eq(events.id, story.eventId))
    await db.update(events).set({ lastSeenAt: sql`greatest(${events.lastSeenAt}, ${now})`, updatedAt: now }).where(eq(events.id, target.eventId))
  } else {
    await db
      .update(eventItems)
      .set({ relation: 'same', newInformation: true, matchedItemId: target.representativeItemId })
      .where(and(eq(eventItems.itemId, itemId), eq(eventItems.eventId, story.eventId)))
  }
  await db
    .update(itemAnalyses)
    .set({ eventId: target.eventId, relation: 'same', outcome: 'merged', outcomeReason: `Merged into story ${target.id} by the editor`, updatedAt: now })
    .where(eq(itemAnalyses.itemId, itemId))

  const original = sourcesOf(story).find((source) => source.role === 'original') ?? sourcesOf(story)[0]
  const targetSources = sourcesOf(target)
  if (original && !targetSources.some((source) => source.url === original.url)) {
    const discussion = targetSources.findIndex((source) => source.role === 'discussion')
    const added = { ...original, role: 'report' as const }
    const sources = discussion < 0 ? [...targetSources, added] : [...targetSources.slice(0, discussion), added, ...targetSources.slice(discussion)]
    await patch(payload, target.id, { sources })
  }
  await patch(payload, id, { status: 'merged', mergedInto: target.id, laterAt: null })
  // The report now counts towards the target's heat; checking the sources now also keeps an
  // editor's later removal of it from coming back.
  await syncEventSources([target.eventId])
  await refreshHeat([target.eventId, story.eventId], now)
  await (deps.refresh ?? refreshDailyCache)()
  const after = await mustLoad(payload, target.id)
  return { target: { id: target.id, title: hansOf(after).title, moreReports: moreReportsOf(after) } }
}

/** 缩短摘要 / 换个标题: one cheap text call; earlier suggestions are passed so a retry gives a new one. */
export async function suggest(id: number, kind: AssistKind, edits: Edits | undefined, avoid: string[], deps: ReviewDeps = {}): Promise<string> {
  const { payload } = await getDb()
  const ai = deps.ai ?? defaultAi
  const story = await mustLoad(payload, id)
  const hans = edits ? { title: edits.title, summary: edits.summary, tryIt: edits.tryIt } : hansOf(story)
  const reports = await loadReports(story.representativeItemId, story.eventId)
  const prompt = [assistPrompt.build({ kind, hans, reportTitles: reports?.prompt.map((report) => report.title) ?? [] })]
  if (avoid.length) prompt.push(`Do not repeat these earlier suggestions:\n${avoid.map((text) => `- ${text}`).join('\n')}`)
  const { output } = await ai.text({
    purpose: 'assist',
    subject: `stories:${id}:${kind}`,
    instructions: assistPrompt.instructions(kind),
    prompt: prompt.join('\n\n'),
    temperature: 0.8,
    maxOutputTokens: 300,
  })
  return cleanSuggestion(output)
}

export function parseLocales(value: unknown): RewrittenLocale[] | undefined {
  if (value === undefined || value === null) return undefined
  if (!Array.isArray(value) || !value.every(isRewrittenLocale)) throw new ReviewError('bad_request', 400, { issues: ['locales'] })
  return value.length ? value : undefined
}
