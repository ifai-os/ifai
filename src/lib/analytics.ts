/**
 * Vercel Web Analytics (docs/specs/foundation.md「访问统计」): page views with no cookies. Each view
 * sends the page's address, so the query string is cut down to the few parameters that say which
 * page it was. Everything else goes: sign-in and subscription links carry tokens, and a search
 * query is the reader's own words.
 */
const keptParams = ['page', 'category', 'board'] as const

export function analyticsUrl(url: string): string {
  const parsed = new URL(url)
  const kept = new URLSearchParams()
  for (const name of keptParams) {
    const value = parsed.searchParams.get(name)
    if (value !== null) kept.set(name, value)
  }
  parsed.search = kept.toString()
  parsed.hash = ''
  return parsed.toString()
}
