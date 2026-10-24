import type { NextRequest } from 'next/server'

import { auth } from '@/lib/auth/auth'
import { getDb } from '@/lib/db/drizzle'
import { isCrossSite } from '@/lib/same-origin'
import { fail, notLaunched, reply } from '@/modules/circles/api'
import { lookUpVideo } from '@/modules/circles/media/videos'
import { circlesLaunched } from '@/modules/circles/public'

export const dynamic = 'force-dynamic'

/**
 * POST /api/circles/videos { url } → { video }: the card for a YouTube, Bilibili or Vimeo link
 * (docs/specs/circles.md rule 13), for a post the member is writing. Members only, from IFAI's
 * own pages. Any other address is 422; the 31st new video of the day is 429. A video nothing
 * could be read about comes back without a title, and shows as a plain link.
 */
export async function POST(request: NextRequest) {
  if (!circlesLaunched()) return notLaunched()
  if (isCrossSite(request)) return fail('cross-site', 403)
  const input = (await request.json().catch(() => null)) as { url?: unknown } | null
  const url = typeof input?.url === 'string' ? input.url.trim().slice(0, 2000) : ''
  if (!url) return fail('invalid-request', 400)
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) return fail('sign-in', 401)
  const { payload } = await getDb()
  const result = await lookUpVideo(payload, url, session.user.id)
  if (result.status === 'unsupported') return fail('unsupported-video', 422)
  if (result.status === 'daily-limit') return fail('daily-limit', 429)
  return reply({ video: result.video })
}
