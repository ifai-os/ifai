/** Slugs that would collide with fixed routes under /[locale]/apps (see docs/specs/apps.md). */
export const reservedAppSlugs: readonly string[] = ['submit', 'category']

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/** "Kimi Slides" → "kimi-slides". Names without Latin letters give "" and need a slug typed by hand. */
export function slugify(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, 64)
    .replace(/^-+|-+$/g, '')
}

export function isValidSlug(value: string): boolean {
  return slugPattern.test(value)
}

/** http(s) URLs only; anything else (javascript:, relative paths, typos) is rejected. */
export function isHttpUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value)
    return protocol === 'https:' || protocol === 'http:'
  } catch {
    return false
  }
}

/** "https://www.Example.com/pricing" → "example.com". Used for Tranco lookups and news-mention matching. */
export function domainFromUrl(value: string): string | undefined {
  if (!isHttpUrl(value)) return undefined
  return new URL(value).hostname.toLowerCase().replace(/^www\./, '') || undefined
}
