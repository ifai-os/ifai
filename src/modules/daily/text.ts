/** Small text helpers shared by the readers. */

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
}

/** HTML or feed text → one line of plain text, entities decoded, whitespace collapsed. */
export function cleanText(value: string | null | undefined, maxLength = 2000): string {
  if (!value) return ''
  const text = value
    .replace(/<\s*(br|p|div|li|h[1-6]|tr)\b[^>]*>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code: string) => {
      if (code[0] === '#') {
        const point = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10)
        return Number.isFinite(point) ? String.fromCodePoint(point) : match
      }
      return ENTITIES[code.toLowerCase()] ?? match
    })
    .replace(/\s+/g, ' ')
    .trim()
  return text.length > maxLength ? `${text.slice(0, maxLength - 1).trimEnd()}…` : text
}

/** A date from feed or page text; undefined when missing or unparseable. */
export function toDate(value: string | Date | null | undefined): Date | undefined {
  if (!value) return undefined
  const date = value instanceof Date ? value : new Date(value.trim())
  return Number.isNaN(date.getTime()) ? undefined : date
}
