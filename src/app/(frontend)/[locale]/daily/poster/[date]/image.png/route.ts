import { localeFromPathSegment } from '@/i18n/config'
import { posterImage } from '@/modules/daily/poster/image'
import { isPosterDate } from '@/modules/daily/poster/rules'
import { getPoster } from '@/modules/daily/public/data'

type Context = { params: Promise<{ locale: string; date: string }> }

// None at build time: each image is drawn on its first request and kept, like the page, until
// the editor generates again or withdraws a story on it (the data it reads carries the daily cache tag).
export function generateStaticParams() {
  return []
}

/** A day's poster in one language, 1080 × 1920 PNG, drawn from what the editor generated. */
export async function GET(_request: Request, { params }: Context) {
  const { locale: segment, date } = await params
  // The locale proxy skips paths with a dot, so the segment arrives as written in the URL (/zh-hans).
  const locale = localeFromPathSegment(segment)
  if (!locale || !isPosterDate(date)) return new Response('Not found', { status: 404 })
  const snapshot = await getPoster(date)
  if (!snapshot) return new Response('Not found', { status: 404 })
  return posterImage(snapshot, locale)
}
