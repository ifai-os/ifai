import { NextResponse, type NextRequest } from 'next/server'

import { getDb } from '@/lib/db/drizzle'
import { collectEnabled, modelCallsEnabled } from '@/lib/switches'
import { parsePush, tokenMatches } from '@/modules/push/rules'

// Writes, and answers per caller: never cached.
export const dynamic = 'force-dynamic'

const noStore = { 'Cache-Control': 'private, no-store' }

function reply(body: object, status = 200) {
  return NextResponse.json(body, { status, headers: noStore })
}

/** The browser extension with `Authorization: Bearer $PUSH_TOKEN`, or a signed-in back-office admin. */
async function allowed(request: NextRequest): Promise<'token' | 'admin' | null> {
  if (tokenMatches(request.headers.get('authorization'))) return 'token'
  const { payload } = await getDb()
  const { user } = await payload.auth({ headers: request.headers }).catch(() => ({ user: null }))
  return user?.collection === 'admins' ? 'admin' : null
}

/** What the extension's「测试连接」shows: who it is signed in as and whether the pipeline runs. */
function switches() {
  return { collectEnabled: collectEnabled(), modelCallsEnabled: modelCallsEnabled() }
}

/** GET /api/push → { ok, as, collectEnabled, modelCallsEnabled }. */
export async function GET(request: NextRequest) {
  const as = await allowed(request)
  if (!as) return reply({ error: 'unauthorized' }, 401)
  return reply({ ok: true, as, ...switches() })
}

/**
 * POST /api/push { kind: "news" | "app", url, title?, summary?, publishedAt?, siteName?, name? }
 * (docs/specs/push.md): a news page joins the collected reports, a tool's site becomes a draft app.
 * Both are deduped the way the pipeline dedupes its own finds; a known one is reported, not added.
 */
export async function POST(request: NextRequest) {
  if (!(await allowed(request))) return reply({ error: 'unauthorized' }, 401)
  const parsed = parsePush(await request.json().catch(() => null))
  if (!parsed.ok) return reply({ error: 'invalid', message: parsed.error }, 400)
  try {
    if (parsed.push.kind === 'news') {
      const { pushNews } = await import('@/modules/push/news')
      return reply({ ...(await pushNews(parsed.push)), ...switches() })
    }
    const { pushApp } = await import('@/modules/push/apps')
    return reply({ ...(await pushApp(parsed.push)), ...switches() })
  } catch (error) {
    console.error('[push] failed:', error)
    return reply({ error: 'failed', message: error instanceof Error ? error.message : String(error) }, 500)
  }
}
