import { eq } from '@payloadcms/db-postgres/drizzle'

import { getDb } from '@/lib/db/drizzle'
import { inngest } from '@/lib/inngest/client'

import { refreshDailyCache } from '../review/cache'
import { rawItems } from '../schema'
import { storyMedia, type StoryMediaData } from '../write/media'

/**
 * The picture or video of an imported story (docs/specs/daily.md「从本地流水线导入」), copied
 * the way the site's own writing step copies a collected story's (「配图与视频」「自动取图」):
 * a JPEG, PNG, WebP or GIF of at most 5 MB into Media, a video's cover from YouTube, Vimeo's
 * oEmbed or the line's own picture. A download that fails leaves the story without a picture.
 */
export const IMPORT_MEDIA_EVENT = 'daily/story.import-media'

export type ImportMediaEvent = {
  name: typeof IMPORT_MEDIA_EVENT
  data: { storyId: number; itemId: number; credit: string }
}

export async function copyImportedMedia({ storyId, itemId, credit }: ImportMediaEvent['data']): Promise<{ kind: StoryMediaData['kind']; problems: string[] } | { skipped: string }> {
  const { payload, db } = await getDb()
  const [item] = await db.select({ media: rawItems.media }).from(rawItems).where(eq(rawItems.id, itemId)).limit(1)
  // Imported again since this was queued, without media: that import already took it off.
  if (!item?.media || !(item.media.image || item.media.video)) return { skipped: 'no media on the report' }
  const story = await payload.findByID({ collection: 'stories', id: storyId, locale: 'en', depth: 0, select: { slug: true, title: true, status: true } })
  const { data, problems } = await storyMedia([{ sourceName: credit, media: item.media }], { alt: story.title, name: story.slug })
  if (problems.length) payload.logger.warn({ storyId, problems }, 'daily import: story media not copied')
  await payload.update({ collection: 'stories', id: storyId, data: { media: data.kind === 'none' ? { kind: 'none', image: null, videoUrl: null, credit: null } : data }, depth: 0 })
  if (story.status === 'published') await refreshDailyCache()
  return { kind: data.kind, problems }
}

export const importMediaJob = inngest.createFunction(
  { id: 'daily-import-media', triggers: [{ event: IMPORT_MEDIA_EVENT }], concurrency: 4, retries: 1 },
  async ({ event, step }) => {
    const data = event.data as ImportMediaEvent['data']
    if (!Number.isInteger(Number(data.storyId)) || !Number.isInteger(Number(data.itemId))) return { skipped: 'bad event' }
    return step.run('copy', () => copyImportedMedia({ storyId: Number(data.storyId), itemId: Number(data.itemId), credit: String(data.credit ?? '') }))
  },
)

export const dailyImportFunctions = [importMediaJob]
