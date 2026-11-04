import type { MetadataRoute } from 'next'

type Env = Record<string, string | undefined>

/**
 * robots.txt. Pages kept out of search engines use noindex, which a crawler can only read if
 * it may fetch the page, so only addresses that are not pages are blocked: the back office,
 * the API, the MCP endpoint and the「打开网站」redirect (a crawler following it would count as a
 * click toward the app's heat). The open API (/api/v1, docs/specs/agents.md) stays open so that
 * agents' fetch tools that heed robots.txt can read it; its answers carry noindex. The uploaded
 * files (/api/media/file/: stories' pictures, app logos) stay open too: pages name them as their
 * share picture and in their structured data, and Google and X only use a picture they may fetch.
 * Vercel preview deployments block everything.
 */
export function robotsFor(origin: string, env: Env = process.env): MetadataRoute.Robots {
  if (env.VERCEL_ENV && env.VERCEL_ENV !== 'production') return { rules: { userAgent: '*', disallow: '/' } }
  return {
    rules: { userAgent: '*', allow: ['/', '/api/v1/', '/api/media/file/'], disallow: ['/admin', '/api/', '/mcp', '/*/apps/*/visit'] },
    sitemap: `${origin}/sitemap.xml`,
  }
}
