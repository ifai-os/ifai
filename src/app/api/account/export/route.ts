import { NextResponse, type NextRequest } from 'next/server'

import { defaultLocale, isLocale } from '@/i18n/config'
import { auth } from '@/lib/auth/auth'
import { exportFileName } from '@/lib/auth/export-file'
import { exportMemberData } from '@/lib/auth/export-member'
import { getDb } from '@/lib/db/drizzle'
import { dayKey } from '@/lib/local-time'
import { isCrossSite } from '@/lib/same-origin'
import { siteUrl } from '@/lib/site-url'

// One member's own data: never rendered ahead or kept by the browser or a CDN.
export const dynamic = 'force-dynamic'

const noStore = { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex' }

function reply(body: object, status: number) {
  return NextResponse.json(body, { status, headers: noStore })
}

/**
 * GET /api/account/export?locale=zh-Hans → the signed-in member's data as a JSON file
 * (docs/specs/foundation.md「导出我的数据」). Members only, and only from IFAI's own pages.
 * `locale` is the page's language, for the names in the file and its first line.
 */
export async function GET(request: NextRequest) {
  if (isCrossSite(request)) return reply({ error: 'cross-site' }, 403)
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) return reply({ error: 'sign-in' }, 401)
  const requested = request.nextUrl.searchParams.get('locale')
  const now = new Date()
  const { payload } = await getDb()
  const data = await exportMemberData(payload, {
    userId: session.user.id,
    sessionId: session.session.id,
    locale: isLocale(requested) ? requested : defaultLocale,
    site: siteUrl(),
    now,
  })
  // The session outlived the account (deleted in another tab): nothing left to export.
  if (!data) return reply({ error: 'sign-in' }, 401)

  return new NextResponse(`${JSON.stringify(data, null, 2)}\n`, {
    headers: {
      ...noStore,
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${exportFileName(dayKey(now, 'UTC'))}"`,
    },
  })
}
