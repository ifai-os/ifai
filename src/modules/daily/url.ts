/**
 * Article URLs are compared after normalization (docs/specs/daily.md「采集规则」: 按网址判重，
 * 去掉跟踪参数). The normalized form is also what we store and link to.
 */

/** Query parameters that only track where a click came from. */
const TRACKING_PARAM =
  /^(utm_[a-z0-9_]+|fbclid|gclid|dclid|gbraid|wbraid|msclkid|yclid|twclid|ttclid|igshid|mc_cid|mc_eid|_hsenc|_hsmi|hsCtaTracking|oly_enc_id|oly_anon_id|vero_id|s_kwcid|srsltid|ncid|cmpid|ref|ref_src|ref_url|referrer|source|si)$/i

/** Lower-case host, no fragment, no tracking parameters, no default port, no trailing slash. */
export function normalizeUrl(input: string, base?: string): string | null {
  let url: URL
  try {
    url = new URL(input.trim(), base)
  } catch {
    return null
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
  if (!url.hostname.includes('.')) return null

  url.hash = ''
  url.hostname = url.hostname.toLowerCase()
  url.username = ''
  url.password = ''
  for (const key of [...url.searchParams.keys()]) {
    if (TRACKING_PARAM.test(key)) url.searchParams.delete(key)
  }
  if (url.pathname.length > 1 && url.pathname.endsWith('/')) {
    url.pathname = url.pathname.replace(/\/+$/, '')
  }
  return url.toString()
}

/** Host without a leading "www.", for "same site" checks and per-source counts. */
export function siteOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    return null
  }
}
