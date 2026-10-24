/**
 * Absolute origin of the current deployment, without a trailing slash.
 * Preview deployments always use their own Vercel URL, so auth callbacks and
 * canonical links never point a preview at production. main's long-lived preview
 * is served at a fixed address instead, which deploy.yml passes as PREVIEW_SITE_URL.
 */
export function siteUrl(): string {
  if (process.env.VERCEL_ENV === 'preview') {
    const fixed = process.env.PREVIEW_SITE_URL
    if (fixed) return fixed.replace(/\/+$/, '')
    if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  }
  const explicit = process.env.NEXT_PUBLIC_SITE_URL
  if (explicit) return explicit.replace(/\/+$/, '')
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  }
  return 'http://localhost:3000'
}
