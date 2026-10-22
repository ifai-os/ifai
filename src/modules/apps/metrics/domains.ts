import { isHttpUrl } from '../normalize'

/**
 * Sites that host many apps under their own paths or subdomains (github.com/owner/repo,
 * huggingface.co/spaces/…, gemini.google.com, the app stores, free hosting). An app on one of
 * them does not own the domain: the domain's Tranco rank is not the app's, and only links under
 * the app's own page count as news about it. The site itself (GitHub, Hugging Face) keeps its
 * rank but is matched by name only, since every story with a link there would count.
 */
export const sharedHosts: ReadonlySet<string> = new Set([
  'apple.com',
  'bitbucket.org',
  'blogspot.com',
  'chromewebstore.google.com',
  'discord.com',
  'discord.gg',
  'facebook.com',
  'gitbook.io',
  'gitee.com',
  'github.com',
  'github.io',
  'gitlab.com',
  'google.com',
  'hf.space',
  'huggingface.co',
  'instagram.com',
  'itch.io',
  'linkedin.com',
  'medium.com',
  'microsoft.com',
  'modelscope.cn',
  'mozilla.org',
  'netlify.app',
  'notion.site',
  'npmjs.com',
  'pages.dev',
  'producthunt.com',
  'pypi.org',
  'reddit.com',
  'replicate.com',
  'sourceforge.net',
  'streamlit.app',
  'substack.com',
  't.me',
  'tiktok.com',
  'twitter.com',
  'vercel.app',
  'webflow.io',
  'wordpress.com',
  'x.com',
  'youtube.com',
])

type Site = { domain?: string | null; website?: string | null }

const hostOf = (url: URL) => url.hostname.toLowerCase().replace(/^www\./, '')

// Still the front page: a language in front (/en, /zh-cn) or an index page at the end.
const languageSegment = /^(ar|de|en|es|fr|id|it|ja|ko|nl|pl|pt|ru|th|tr|vi|zh)([-_][a-z0-9]{2,4})?$/
const frontPageSegment = /^(index\.html?|home)$/

function segmentsOf(url: URL): string[] {
  const segments = url.pathname.toLowerCase().split('/').filter(Boolean)
  if (segments.length > 0 && languageSegment.test(segments[0])) segments.shift()
  if (segments.length > 0 && frontPageSegment.test(segments[segments.length - 1])) segments.pop()
  return segments
}

function domainOf(site: Site): string | null {
  return site.domain?.trim().toLowerCase().replace(/^www\./, '') || null
}

/**
 * The website's path when it is a page on the 官网域名 ("/owner/repo", "/magic") rather than the
 * site's front page; none for the front page (also /en, /index.html) or when the 官网域名 is not
 * the website's own host.
 */
function pageOf(domain: string, website: string | null | undefined): string[] {
  if (!website || !isHttpUrl(website)) return []
  const url = new URL(website)
  return hostOf(url) === domain ? segmentsOf(url) : []
}

/**
 * The domains to look up in Tranco for an app: its 官网域名 and the domains above it
 * (chat.deepseek.com → chat.deepseek.com, deepseek.com). The list has registered domains only,
 * so the longest one found is the app's registered domain.
 */
export function trancoCandidates(site: Site): string[] {
  const labels = domainOf(site)?.split('.') ?? []
  return labels.slice(0, -1).map((_, index) => labels.slice(index).join('.'))
}

/**
 * The app's Tranco rank (docs/specs/apps.md「热度」): the rank of its registered domain. None for
 * an app that is a page or a subdomain of a shared host (github.com/owner/repo,
 * gemini.google.com): that rank is the host's, not the app's.
 */
export function trancoRankOf(site: Site, ranks: Readonly<Record<string, number>>): { domain: string; rank: number } | null {
  const domain = domainOf(site)
  if (!domain) return null
  for (const candidate of trancoCandidates(site)) {
    const rank = ranks[candidate]
    if (rank === undefined) continue
    if (sharedHosts.has(candidate) && (candidate !== domain || pageOf(domain, site.website).length > 0)) return null
    return { domain: candidate, rank }
  }
  return null
}

/**
 * Whether a link is on the app's website: the same host or a subdomain of it; for an app that is
 * a page on a bigger site (github.com/owner/repo, canva.com/magic), only links under that page.
 */
export function isOnSite(link: string, site: Site): boolean {
  const domain = domainOf(site)
  if (!domain || !isHttpUrl(link)) return false
  const url = new URL(link)
  const host = hostOf(url)
  const page = pageOf(domain, site.website)
  if (page.length > 0) {
    if (host !== domain) return false
    const segments = segmentsOf(url)
    return page.every((segment, index) => segments[index] === segment)
  }
  if (sharedHosts.has(domain)) return false
  return host === domain || host.endsWith(`.${domain}`)
}
