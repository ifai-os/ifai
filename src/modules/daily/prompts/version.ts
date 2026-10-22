import { createHash } from 'node:crypto'

/**
 * Prompts are versioned by content (docs/specs/daily.md「流程」): the version is the name
 * plus the first 8 hex digits of the SHA-256 of the instructions, so an edited prompt gets a
 * new version on its own and receipts for the old text are never reused by mistake.
 */
export function promptVersion(name: string, instructions: string): string {
  return `${name}@${createHash('sha256').update(instructions).digest('hex').slice(0, 8)}`
}

/** Cut long outside text before it goes into a prompt; says so when it does. */
export function excerpt(text: string | null | undefined, maxChars: number): string {
  if (!text) return ''
  return text.length > maxChars ? `${text.slice(0, maxChars)}\n[… truncated, ${text.length - maxChars} more characters]` : text
}
