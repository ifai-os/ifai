export { inReaderLanguage, type InLanguage, type Localized } from '@/lib/i18n/localized'

/** One letter for the placeholder tile: the first character of the name, upper-cased. */
export function initialOf(name: string): string {
  const first = Array.from(name.trim())[0] ?? '?'
  return first.toLocaleUpperCase('en')
}
