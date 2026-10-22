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
