import { and, eq, gte, inArray } from '@payloadcms/db-postgres/drizzle'
import { randomBytes } from 'node:crypto'

import { ai as defaultAi, type ContestImage } from '@/lib/ai'
import { MAX_ATTEMPTS } from '@/lib/ai/limits'
import { modelReceipts } from '@/lib/ai/schema'
import { getDb } from '@/lib/db/drizzle'
import { shanghaiDayStart } from '@/lib/shanghai-day'

import { storyCategoryOf } from '../categories'
import { illustratePrompt } from '../prompts'
import { refreshDailyCache } from '../review/cache'
import { alreadyTried, ILLUSTRATE_AFTER_MS, illustrationSubject } from './rules'

/**
 * A story's picture drawn by a model when it has none (docs/specs/daily.md「AI 配图」). The
 * picture is stored in Media like a copied one and the story's media marked `generated`, so the
 * story page says it is AI-generated. Stories with a video are left alone.
 */

const PURPOSE = 'illustrate' as const

/** Pictures started today (Shanghai day), retries of an earlier day's call not included. */
export async function illustrationsStartedToday(now: Date): Promise<number> {
  const { db } = await getDb()
  const rows = await db
    .select({ id: modelReceipts.id })
    .from(modelReceipts)
    .where(and(eq(modelReceipts.purpose, PURPOSE), gte(modelReceipts.createdAt, shanghaiDayStart(now))))
  return rows.length
}

/** Pending or published stories without media, newest first, created long enough ago, never drawn before. */
export async function findUnillustrated(now: Date, limit: number): Promise<number[]> {
  if (limit <= 0) return []
  const { payload, db } = await getDb()
  const { docs } = await payload.find({
    collection: 'stories',
    where: {
      and: [
        { status: { in: ['pending', 'published'] } },
        { createdAt: { less_than: new Date(now.getTime() - ILLUSTRATE_AFTER_MS).toISOString() } },
        { or: [{ 'media.kind': { equals: 'none' } }, { 'media.kind': { exists: false } }] },
      ],
    },
    sort: '-publishedAt',
    limit: limit * 4,
    depth: 0,
    pagination: false,
    select: {},
  })
  if (!docs.length) return []
  const receipts = await db
    .select({ subject: modelReceipts.subject, status: modelReceipts.status, attempts: modelReceipts.attempts })
    .from(modelReceipts)
    .where(and(eq(modelReceipts.purpose, PURPOSE), inArray(modelReceipts.subject, docs.map((doc) => illustrationSubject(doc.id)))))
  const tried = alreadyTried(receipts, MAX_ATTEMPTS)
  return docs.map((doc) => doc.id).filter((id) => !tried.has(illustrationSubject(id))).slice(0, limit)
}

const extensions: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }

export type IllustrateResult = { status: 'drawn'; image: number; reused: boolean } | { status: 'skipped'; reason: string }

type Deps = { ai?: Pick<typeof defaultAi, 'image'> }

/** Draw one story's picture, unless it got media of its own in the meantime. */
export async function illustrateStory(storyId: number, deps: Deps = {}): Promise<IllustrateResult> {
  const { payload } = await getDb()
  const load = () =>
    payload.findByID({
      collection: 'stories',
      id: storyId,
      locale: 'en',
      depth: 0,
      select: { slug: true, title: true, summary: true, category: true, status: true, media: true },
    })
  const story = await load()
  if (story.media?.kind && story.media.kind !== 'none') return { status: 'skipped', reason: 'has media' }
  if (story.status !== 'pending' && story.status !== 'published') return { status: 'skipped', reason: `status ${story.status}` }

  const keep = async (picture: ContestImage): Promise<number> => {
    const name = `${story.slug}-ai-${randomBytes(3).toString('hex')}.${extensions[picture.mediaType] ?? 'png'}`
    const doc = await payload.create({
      collection: 'media',
      data: { alt: story.title },
      file: { data: Buffer.from(picture.data), mimetype: picture.mediaType, name, size: picture.data.byteLength },
    })
    return doc.id
  }

  const { output, reused } = await (deps.ai ?? defaultAi).image({
    purpose: PURPOSE,
    instructions: illustratePrompt.instructions,
    prompt: illustratePrompt.build({ title: story.title, summary: story.summary ?? null, category: storyCategoryOf(story.category) }),
    aspectRatio: illustratePrompt.aspectRatio,
    variant: illustratePrompt.version,
    subject: illustrationSubject(storyId),
    keep,
  })
  if (output.image === null) return { status: 'skipped', reason: 'the model returned no picture' }
  // A reused receipt points at the picture stored the first time, which may have been deleted since.
  const stored = await payload.findByID({ collection: 'media', id: output.image, depth: 0, select: {} }).catch(() => null)
  if (!stored) return { status: 'skipped', reason: 'its picture was deleted' }

  // The editor may have added a picture or video while the model was drawing.
  const now = await load()
  if (now.media?.kind && now.media.kind !== 'none') return { status: 'skipped', reason: 'has media' }
  await payload.update({
    collection: 'stories',
    id: storyId,
    depth: 0,
    data: { media: { kind: 'image', image: output.image, videoUrl: null, credit: null, generated: true } },
    context: { illustrated: true },
  })
  if (now.status === 'published') await refreshDailyCache()
  return { status: 'drawn', image: output.image, reused }
}
