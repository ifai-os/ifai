import { parse } from 'yaml'

/** The header of SKILL.md. Agent Skills require `name` and `description`; the rest is kept as is. */
export type Frontmatter = Record<string, unknown>

export type ParsedSkillMd = {
  raw: string
  frontmatter: Frontmatter | null
  body: string
  /** Why the header could not be used, when it could not. */
  error?: string
}

const headerPattern = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)([\s\S]*)$/

export function parseSkillMd(raw: string): ParsedSkillMd {
  const text = raw.replace(/^﻿/, '')
  const match = headerPattern.exec(text)
  if (!match) return { raw, frontmatter: null, body: text, error: 'SKILL.md has no frontmatter block (--- … ---)' }
  const [, header, body] = match
  let value: unknown
  try {
    // Core schema only: no dates, no custom tags; aliases capped against reference bombs.
    value = parse(header, { schema: 'core', maxAliasCount: 20 })
  } catch (error) {
    return { raw, frontmatter: null, body, error: `Frontmatter is not valid YAML: ${(error as Error).message}` }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { raw, frontmatter: null, body, error: 'Frontmatter is not a key: value mapping' }
  }
  // Round-trip through JSON so what we store is exactly what a json field can hold.
  return { raw, frontmatter: JSON.parse(JSON.stringify(value)) as Frontmatter, body }
}

/** What the spec requires of the header (rule 1): a non-empty name and description. */
export function frontmatterProblems(parsed: ParsedSkillMd): string[] {
  if (parsed.error) return [parsed.error]
  const problems: string[] = []
  for (const key of ['name', 'description'] as const) {
    const value = parsed.frontmatter?.[key]
    if (typeof value !== 'string' || !value.trim()) problems.push(`Frontmatter is missing "${key}"`)
  }
  return problems
}

/** A version number the author put in the header, if any (`version` or `metadata.version`). */
export function frontmatterVersion(frontmatter: Frontmatter | null): string | undefined {
  const direct = frontmatter?.version
  if (typeof direct === 'string' || typeof direct === 'number') return String(direct)
  const metadata = frontmatter?.metadata
  if (metadata && typeof metadata === 'object') {
    const nested = (metadata as Record<string, unknown>).version
    if (typeof nested === 'string' || typeof nested === 'number') return String(nested)
  }
  return undefined
}

/** A license the author put in the header, if any. */
export function frontmatterLicense(frontmatter: Frontmatter | null): string | undefined {
  const value = frontmatter?.license
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}
