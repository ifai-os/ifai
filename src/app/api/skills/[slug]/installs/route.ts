import { type NextRequest, userAgent } from 'next/server'

import { isCrossSite } from '@/lib/same-origin'
import { clientIp } from '@/lib/visitor'
import { isValidVersion } from '@/modules/resources/normalize'
import { isInstallable } from '@/modules/resources/public/data'
import { readHost, recordInstall } from '@/modules/resources/public/installs'

const noStore = { 'cache-control': 'no-store' }

/**
 * POST /api/skills/<slug>/installs {version, host}: the install panel's「复制安装指令」was used.
 * Counted once per visitor, Skill and day like every other install; bots are not counted.
 */
export async function POST(request: NextRequest, { params }: RouteContext<'/api/skills/[slug]/installs'>) {
  // Only IFAI's own install panel counts a copy: another site's page cannot add installs through its visitors.
  if (isCrossSite(request)) return Response.json({ error: 'Cross-site' }, { status: 403, headers: noStore })
  const { slug } = await params
  let body: { version?: unknown; host?: unknown } = {}
  try {
    body = (await request.json()) as typeof body
  } catch {
    return Response.json({ error: 'Expected JSON' }, { status: 400, headers: noStore })
  }
  const version = typeof body.version === 'string' ? body.version : ''
  if (!isValidVersion(version)) return Response.json({ error: 'Unknown version' }, { status: 404, headers: noStore })

  const target = await isInstallable(slug, version)
  if (!target) return Response.json({ error: 'Not installable' }, { status: 404, headers: noStore })

  const secret = process.env.PAYLOAD_SECRET
  const visitor = request.headers.get('user-agent') ?? ''
  if (secret && visitor.trim() && !userAgent(request).isBot) {
    await recordInstall(
      { skillId: target.skillId, versionId: target.versionId, type: 'copy', host: readHost(body.host) },
      { ip: clientIp(request.headers), userAgent: visitor, secret },
    )
  }
  return new Response(null, { status: 204, headers: noStore })
}
