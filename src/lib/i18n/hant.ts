import * as OpenCC from 'opencc-js'

/**
 * Simplified → Traditional Chinese (Taiwan, with phrase replacement).
 * All zh-Hant text is produced this way — UI strings via `pnpm i18n:hant`,
 * editorial content via this helper — never by a model.
 */
let converter: ((text: string) => string) | undefined

export function toHant(text: string): string {
  converter ??= OpenCC.Converter({ from: 'cn', to: 'twp' })
  return converter(text)
}

let reverse: ((text: string) => string) | undefined

/**
 * Traditional (Taiwan, with phrases) → Simplified Chinese, for readers' own Traditional text
 * shown on a Simplified page (a review's「翻译」). Like the other way, never a model.
 */
export function toHans(text: string): string {
  reverse ??= OpenCC.Converter({ from: 'twp', to: 'cn' })
  return reverse(text)
}
