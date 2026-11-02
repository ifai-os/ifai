import { randomBytes } from 'node:crypto'

/**
 * How MCP tool results are written (docs/specs/agents.md「MCP」): short Markdown an agent reads
 * in its context, where every item names its id or slug and address, so the agent can ask for
 * more and link the reader to it.
 */

/** A new mark for one answer's untrusted blocks: 64 random bits, nothing a post could guess. */
export function newNonce(): string {
  return randomBytes(8).toString('hex')
}

function attribute(value: string): string {
  return value.replace(/[\r\n\t]+/g, ' ').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/**
 * Text written by members or Skill authors (rule 8): fenced with this answer's nonce, so a closing
 * tag inside it cannot end the block early. The agent is told what the block means in the
 * server's instructions and in every tool's description.
 */
export function untrusted(text: string, nonce: string, attributes: Record<string, string | null | undefined> = {}): string {
  const attrs = Object.entries(attributes)
    .filter((entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1] !== '')
    .map(([key, value]) => ` ${key}="${attribute(value)}"`)
    .join('')
  const body = text.split(nonce).join('').trim()
  return `<untrusted nonce="${nonce}"${attrs}>\n${body}\n</untrusted nonce="${nonce}">`
}

/** A time as agents read it, in UTC: `2026-11-01 14:05 UTC`. */
export function utc(iso: string | null | undefined): string | null {
  if (!iso) return null
  const time = new Date(iso)
  if (Number.isNaN(time.getTime())) return null
  return `${time.toISOString().slice(0, 16).replace('T', ' ')} UTC`
}

/** One line of facts, `a · b · c`, leaving out the empty ones. */
export function facts(...parts: (string | number | null | undefined | false)[]): string {
  return parts.filter((part) => part !== null && part !== undefined && part !== false && part !== '').join(' · ')
}

/**
 * Lines into a block: parts that are not strings (a missing field) are left out, `''` is a blank
 * line, and where two parts meet there is at most one blank line. The parts' own text, such as a
 * code block with two blank lines in it, is kept as it is. A block that starts with a blank line
 * keeps it, so a block nested in another stays apart from what comes before it; the answer as a
 * whole is trimmed where it is sent (`finish`).
 */
export function lines(...parts: (string | null | undefined | false)[]): string {
  let out: string | null = null
  for (const part of parts) {
    if (typeof part !== 'string') continue
    if (out === null) {
      out = part.replace(/^\n{2,}/, '\n')
      continue
    }
    const head: string = out.replace(/\n+$/, '')
    const tail: string = part.replace(/^\n+/, '')
    const breaks = Math.min(2, out.length - head.length + 1 + (part.length - tail.length))
    out = `${head}${'\n'.repeat(breaks)}${tail}`
  }
  return (out ?? '').replace(/\s+$/, '')
}

/** An answer as sent: no blank lines around it, and one line break at the end. */
export function finish(text: string): string {
  return `${text.trim()}\n`
}

/** Text on one line, for list items: line breaks become spaces. */
export function oneLine(text: string | null | undefined): string {
  return (text ?? '').replace(/\s+/g, ' ').trim()
}

/** `1 story`, `3 stories`. */
export function count(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`
}
