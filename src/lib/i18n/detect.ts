import * as OpenCC from 'opencc-js'

import type { Locale } from '@/i18n/config'

const hangul = /[ᄀ-ᇿ㄰-㆏가-힯]/u
const kana = /[぀-ヿㇰ-ㇿｦ-ﾟ]/u
const han = /\p{Script=Han}/gu
const latin = /\p{Script=Latin}/u
const letter = /\p{L}/u

// Character for character, no phrases: only whether a character exists in the other form matters here.
let toTraditional: ((text: string) => string) | undefined
let toSimplified: ((text: string) => string) | undefined

/**
 * The language a reader wrote something in (a review), for its `lang` attribute. The script
 * decides: Hangul is Korean, kana Japanese, Chinese characters Chinese, Simplified or Traditional
 * by which form OpenCC would change; Latin letters are English, the site's one Latin-script
 * language. Where the characters cannot tell the two Chinese forms apart, the page decides: a
 * Traditional Chinese page means Traditional, a Japanese page Japanese written in kanji alone,
 * any other Simplified. Other scripts are `und`; text with no letters at all takes the page's language.
 */
export function detectLanguage(text: string, pageLocale: Locale): Locale | 'und' {
  if (hangul.test(text)) return 'ko'
  if (kana.test(text)) return 'ja'
  const chinese = text.match(han)?.join('')
  if (chinese) {
    toTraditional ??= OpenCC.Converter({ from: 'cn', to: 'tw' })
    toSimplified ??= OpenCC.Converter({ from: 'tw', to: 'cn' })
    const simplifiedOnly = toTraditional(chinese) !== chinese
    const traditionalOnly = toSimplified(chinese) !== chinese
    if (traditionalOnly && !simplifiedOnly) return 'zh-Hant'
    if (simplifiedOnly && !traditionalOnly) return 'zh-Hans'
    return pageLocale === 'zh-Hant' || pageLocale === 'ja' ? pageLocale : 'zh-Hans'
  }
  if (latin.test(text)) return 'en'
  return letter.test(text) ? 'und' : pageLocale
}
