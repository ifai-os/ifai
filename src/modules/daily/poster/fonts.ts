/**
 * Fonts for the poster images, from Google Fonts: Noto Sans in the family of each language
 * on the poster, cut down to the characters the poster uses (the `text` parameter) and served
 * as TrueType, which the image renderer reads. Pages never load these (AGENTS.md: no CJK web
 * fonts); the images need the glyphs drawn in. Responses go through the fetch cache, so a
 * poster rendered again does not download its fonts again.
 */
import type { Locale } from '@/i18n/config'

export const posterFamilies: Record<Locale, string> = {
  en: 'Noto Sans',
  'zh-Hans': 'Noto Sans SC',
  'zh-Hant': 'Noto Sans TC',
  ja: 'Noto Sans JP',
  ko: 'Noto Sans KR',
}

export const posterWeights = [400, 700] as const

export type PosterFont = { name: string; data: ArrayBuffer; weight: (typeof posterWeights)[number]; style: 'normal' }

/** Text on the poster in one language; the language picks the font family. */
export type PosterText = { lang: Locale; text: string }

type Fetch = typeof fetch

async function fetchFont(family: string, weight: number, text: string, fetcher: Fetch): Promise<ArrayBuffer> {
  const url = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@${weight}&text=${encodeURIComponent(text)}`
  const css = await fetcher(url, { cache: 'force-cache' })
  if (!css.ok) throw new Error(`${family} ${weight}: Google Fonts answered ${css.status}`)
  const source = (await css.text()).match(/src:\s*url\(([^)]+)\)\s*format\('(?:truetype|opentype)'\)/)
  if (!source) throw new Error(`${family} ${weight}: no TrueType file in the Google Fonts answer`)
  const file = await fetcher(source[1], { cache: 'force-cache' })
  if (!file.ok) throw new Error(`${family} ${weight}: font file answered ${file.status}`)
  return file.arrayBuffer()
}

/** The characters each family has to draw, the families in order of first use. */
export function charactersByFamily(texts: readonly PosterText[]): Map<string, string> {
  const sets = new Map<string, Set<string>>()
  for (const { lang, text } of texts) {
    const family = posterFamilies[lang]
    const set = sets.get(family) ?? new Set<string>()
    for (const char of text) if (char !== '\n' && char !== '\t') set.add(char)
    sets.set(family, set)
  }
  return new Map([...sets].filter(([, set]) => set.size > 0).map(([family, set]) => [family, [...set].sort().join('')]))
}

/** Every family the poster's text needs, in both weights. Fails when one cannot be loaded. */
export async function posterFonts(texts: readonly PosterText[], fetcher: Fetch = fetch): Promise<PosterFont[]> {
  const wanted = [...charactersByFamily(texts)].flatMap(([family, characters]) => posterWeights.map((weight) => ({ family, weight, characters })))
  return Promise.all(
    wanted.map(async ({ family, weight, characters }) => ({
      name: family,
      data: await fetchFont(family, weight, characters, fetcher),
      weight,
      style: 'normal' as const,
    })),
  )
}
