import type { NextRequest } from 'next/server'

import { auth } from '@/lib/auth/auth'
import { getDb } from '@/lib/db/drizzle'
import { isCrossSite } from '@/lib/same-origin'
import { fail, notLaunched, reply } from '@/modules/circles/api'
import { inspectImage, saveImage, uploadsToday } from '@/modules/circles/media/images'
import { circlesLaunched } from '@/modules/circles/public'
import { mediaRules } from '@/modules/circles/rules'

export const dynamic = 'force-dynamic'

/** Room for the form's own lines around the file. */
const formOverhead = 64 * 1024

/**
 * POST /api/circles/images (a form with `file`) → { image: { id, width, height } }: one picture
 * for a post the member is writing (docs/specs/circles.md rule 12). Members only, from IFAI's own
 * pages. The page shrinks it first: over 4 MB is 413, anything but a JPEG, PNG, WebP or GIF (read
 * from the bytes) or over 50 million pixels is 422, the 91st of the day is 429. Nobody can open
 * it until the post is published.
 */
export async function POST(request: NextRequest) {
  if (!circlesLaunched()) return notLaunched()
  if (isCrossSite(request)) return fail('cross-site', 403)
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) return fail('sign-in', 401)
  if (Number(request.headers.get('content-length')) > mediaRules.maxUploadBytes + formOverhead) return fail('too-large', 413)
  const form = await request.formData().catch(() => null)
  const file = form?.get('file')
  if (!(file instanceof File)) return fail('invalid-request', 400)
  if (file.size > mediaRules.maxUploadBytes) return fail('too-large', 413)
  const bytes = new Uint8Array(await file.arrayBuffer())
  const image = await inspectImage(bytes)
  if (!image) return fail('invalid-image', 422)
  const userId = session.user.id
  const { payload } = await getDb()
  if ((await uploadsToday(payload, userId)) >= mediaRules.dailyImages) return fail('daily-limit', 429)
  const saved = await saveImage(payload, { bytes, mimeType: image.mimeType }, { kind: 'post', uploader: userId })
  return reply({ image: saved })
}
