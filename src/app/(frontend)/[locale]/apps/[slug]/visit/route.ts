import { after, type NextRequest, userAgent } from 'next/server'

import { isLocale } from '@/i18n/config'
import { getPathname } from '@/i18n/navigation'
import { clientIp, isCountedVisit } from '@/lib/visitor'
import { getVisitTarget } from '@/modules/apps/data'
import { recordClick } from '@/modules/apps/metrics/clicks'
import { isValidSlug } from '@/modules/apps/normalize'

// Every request is a visit to count, so nothing here is cached.
export const dynamic = 'force-dynamic'

const noStore = { 'cache-control': 'no-store', 'x-robots-tag': 'noindex, nofollow' }

/**
 * The「打开网站」button (docs/specs/apps.md「页面与路由」): count the click toward the app's heat,
 * then send the visitor on to its website. Bots and prefetches are not counted; an app that is
 * not published (or has no website) goes back to its page.
 */
export async function GET(request: NextRequest, { params }: RouteContext<'/[locale]/apps/[slug]/visit'>) {
  const { locale, slug } = await params
  if (!isLocale(locale) || !isValidSlug(slug)) return new Response('Not found', { status: 404, headers: noStore })

  const target = await getVisitTarget(slug)
  if (!target) {
    return new Response(null, { status: 302, headers: { ...noStore, location: getPathname({ href: `/apps/${slug}`, locale }) } })
  }

  const secret = process.env.PAYLOAD_SECRET
  const visitor = request.headers.get('user-agent') ?? ''
  if (secret && isCountedVisit(request, userAgent(request).isBot)) {
    const ip = clientIp(request.headers)
    // After the redirect is sent: the visitor never waits for the database.
    after(async () => {
      try {
        await recordClick(target.appId, { ip, userAgent: visitor, secret })
      } catch (error) {
        console.warn('Could not record an app click', error)
      }
    })
  }

  return new Response(null, { status: 302, headers: { ...noStore, location: new URL(target.website).href } })
}
