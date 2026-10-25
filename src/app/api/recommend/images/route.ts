import type { NextRequest } from 'next/server'

import { auth } from '@/lib/auth/auth'
import { getDb } from '@/lib/db/drizzle'
import { isCrossSite } from '@/lib/same-origin'
import { closed, fail, reply } from '@/modules/recommend/api'
import { inspectImage, saveImage, uploadsToday } from '@/modules/recommend/images'
import { writeRules } from '@/modules/recommend/writing'

export const dynamic = 'force-dynamic'

/** Room for the form's own lines around the file. */
const formOverhead = 64 * 1024

/**
 * POST /api/recommend/images (a form with `file`) → { image: { id, url, width, height } }: a cover
 * or a picture for an article the member is writing (docs/specs/recommend.md rule 14). Members
 * only, from IFAI's own pages. The page shrinks it first: over 4 MB is 413, anything but a JPEG,
 * PNG, WebP or GIF (read from the bytes) or over 50 million pixels is 422, the 51st of the day is
 * 429. Only its uploader can open it until its article is published.
 */
export async function POST(request: NextRequest) {
  const shut = closed()
  if (shut) return shut
  if (isCrossSite(request)) return fail('cross-site', 403)
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) return fail('sign-in', 401)
  if (Number(request.headers.get('content-length')) > writeRules.maxUploadBytes + formOverhead) return fail('too-large', 413)
  const form = await request.formData().catch(() => null)
  const file = form?.get('file')
  if (!(file instanceof File)) return fail('invalid-request', 400)
  if (file.size > writeRules.maxUploadBytes) return fail('too-large', 413)
  const bytes = new Uint8Array(await file.arrayBuffer())
  const image = await inspectImage(bytes)
  if (!image) return fail('invalid-image', 422)
  const userId = session.user.id
  const { payload } = await getDb()
  if ((await uploadsToday(payload, userId)) >= writeRules.dailyImages) return fail('daily-limit', 429)
  return reply({ image: await saveImage(payload, { bytes, mimeType: image.mimeType }, userId) })
}
