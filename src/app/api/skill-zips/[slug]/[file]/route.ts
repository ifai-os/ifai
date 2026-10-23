import { after, type NextRequest, userAgent } from 'next/server'

import { clientIp, isCountedVisit } from '@/lib/visitor'
import { isValidVersion } from '@/modules/resources/normalize'
import { getInstallTarget } from '@/modules/resources/public/data'
import { readHost, recordInstall } from '@/modules/resources/public/installs'

// Every request is a download to count.
export const dynamic = 'force-dynamic'

const noStore = { 'cache-control': 'no-store', 'x-robots-tag': 'noindex, nofollow' }

/**
 * GET /api/skills/<slug>/<version>.zip (rewritten here in next.config.ts): check the version
 * can be installed, count the download, then send the browser to Payload's file route, which
 * checks access again and redirects to a short-lived R2 address (docs/specs/resources.md).
 * `?via=install` marks the download install.md leads to, already counted when it was fetched.
 */
export async function GET(request: NextRequest, { params }: RouteContext<'/api/skill-zips/[slug]/[file]'>) {
  const { slug, file } = await params
  const version = file.replace(/\.zip$/, '')
  if (!file.endsWith('.zip') || !isValidVersion(version)) return new Response('Not found', { status: 404, headers: noStore })

  const target = await getInstallTarget(slug, version)
  if (!target) return new Response('This version cannot be downloaded.', { status: 404, headers: noStore })

  const secret = process.env.PAYLOAD_SECRET
  const visitor = request.headers.get('user-agent') ?? ''
  const counted = request.nextUrl.searchParams.get('via') !== 'install'
  if (secret && counted && isCountedVisit(request, userAgent(request).isBot)) {
    const ip = clientIp(request.headers)
    const host = readHost(request.nextUrl.searchParams.get('host'))
    after(async () => {
      try {
        await recordInstall({ skillId: target.skillId, versionId: target.versionId, type: 'download', host }, { ip, userAgent: visitor, secret })
      } catch (error) {
        console.warn('Could not record a Skill download', error)
      }
    })
  }

  const location = new URL(`/api/skill-versions/file/${encodeURIComponent(target.filename)}`, request.nextUrl.origin)
  return new Response(null, { status: 302, headers: { ...noStore, location: location.href } })
}
