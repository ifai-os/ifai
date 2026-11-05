import { localeFromPathSegment } from '@/i18n/config'
import { getStory } from '@/modules/daily/public/data'
import { storyShareImage } from '@/modules/daily/public/share-image'

type Context = { params: Promise<{ locale: string; slug: string }> }

// None at build time: each picture is drawn on its first request and kept, like the story's page,
// until the editor changes the story (the data it reads carries the daily cache tag).
export function generateStaticParams() {
  return []
}

/** The share picture of a story without a picture of its own, 1200 × 630 PNG (docs/specs/daily.md「分享卡片」). */
export async function GET(_request: Request, { params }: Context) {
  const { locale: segment, slug } = await params
  // The locale proxy skips paths with a dot, so the segment arrives as written in the URL (/zh-hans).
  const locale = localeFromPathSegment(segment)
  if (!locale) return new Response('Not found', { status: 404 })
  const story = await getStory(slug, locale)
  if (!story) return new Response('Not found', { status: 404 })
  return storyShareImage(story, locale)
}
