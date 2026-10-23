import { after, type NextRequest, userAgent } from 'next/server'

import { clientIp, isCountedVisit } from '@/lib/visitor'
import { isValidVersion } from '@/modules/resources/normalize'
import { getInstallHosts, getInstallTarget } from '@/modules/resources/public/data'
import { renderInstallMd } from '@/modules/resources/public/install'
import { readHost, recordInstall } from '@/modules/resources/public/installs'

// Every fetch is an install to count.
export const dynamic = 'force-dynamic'

const headers = { 'cache-control': 'no-store', 'x-robots-tag': 'noindex', 'x-content-type-options': 'nosniff' }

/**
 * GET /api/skills/<slug>/install.md[?v=<version>][&host=<host>]: the steps the install
 * instruction points the reader's assistant at (docs/specs/resources.md「语言无关的接口」).
 * Counts as one install; the Zip it links to is not counted again.
 */
export async function GET(request: NextRequest, { params }: RouteContext<'/api/skills/[slug]/install.md'>) {
  const { slug } = await params
  const version = request.nextUrl.searchParams.get('v') ?? undefined
  if (version !== undefined && !isValidVersion(version)) return new Response('Not found\n', { status: 404, headers })

  const target = await getInstallTarget(slug, version)
  if (!target) {
    return new Response('This Skill or version cannot be installed from IFAI right now.\n', {
      status: 404,
      headers: { ...headers, 'content-type': 'text/plain; charset=utf-8' },
    })
  }
  const hosts = await getInstallHosts()
  const host = readHost(request.nextUrl.searchParams.get('host'))
  const body = renderInstallMd(
    target,
    hosts.map((item) => ({
      slug: item.slug,
      name: item.name,
      website: item.website ?? null,
      globalDir: item.globalDir ?? null,
      projectDir: item.projectDir ?? null,
      instructions: item.instructions ?? null,
    })),
    hosts.some((item) => item.slug === host) ? host : null,
  )

  const secret = process.env.PAYLOAD_SECRET
  const visitor = request.headers.get('user-agent') ?? ''
  if (secret && isCountedVisit(request, userAgent(request).isBot)) {
    const ip = clientIp(request.headers)
    after(async () => {
      try {
        await recordInstall({ skillId: target.skillId, versionId: target.versionId, type: 'fetch', host }, { ip, userAgent: visitor, secret })
      } catch (error) {
        console.warn('Could not record a Skill install', error)
      }
    })
  }

  return new Response(body, { headers: { ...headers, 'content-type': 'text/markdown; charset=utf-8' } })
}
