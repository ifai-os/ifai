import type { MetadataRoute } from 'next'

type Env = Record<string, string | undefined>

/**
 * robots.txt. Pages kept out of search engines use noindex, which a crawler can only read if
 * it may fetch the page, so only addresses that are not pages are blocked: the back office,
 * the API and the「打开网站」redirect (a crawler following it would count as a click toward
 * the app's heat). Vercel preview deployments block everything.
 */
export function robotsFor(origin: string, env: Env = process.env): MetadataRoute.Robots {
  if (env.VERCEL_ENV && env.VERCEL_ENV !== 'production') return { rules: { userAgent: '*', disallow: '/' } }
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/admin', '/api/', '/*/apps/*/visit'] },
    sitemap: `${origin}/sitemap.xml`,
  }
}
