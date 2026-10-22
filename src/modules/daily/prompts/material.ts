import { untrusted } from '@/lib/ai/untrusted'

import type { SourceTier, SourceUse } from '../types'
import { excerpt } from './version'

/** What the judging prompts get to see about one item. Everything but `source` came from outside. */
export type Material = {
  url: string
  title: string
  summary?: string | null
  content?: string | null
  publishedAt?: Date | string | null
  source: { name: string; tier: SourceTier; use: SourceUse }
  /** Hacker News thread, when the item was found there. */
  discussion?: { url: string; points?: number; comments?: number } | null
}

export const tierWords: Record<SourceTier, string> = {
  T1: 'official, first-hand',
  T1_5: 'official account or near-official',
  T2: 'media or individual',
}

/**
 * The item as prompt text. Outside text goes through `untrusted()` so the model treats it
 * as material; the article body is cut to `maxContentChars`.
 */
export function materialText(material: Material, { maxContentChars }: { maxContentChars: number }): string {
  const published = material.publishedAt ? new Date(material.publishedAt).toISOString() : 'unknown'
  const lines = [
    `Source: ${material.source.name} (${tierWords[material.source.tier]}; ${material.source.use})`,
    `Published: ${published}`,
    `URL: ${material.url}`,
    untrusted('title', material.title),
  ]
  if (material.summary) lines.push(untrusted('summary', excerpt(material.summary, 2000)))
  if (material.content) lines.push(untrusted('article', excerpt(material.content, maxContentChars)))
  else lines.push('(No article body could be fetched; only the title and summary are available.)')
  if (material.discussion) {
    const { points, comments } = material.discussion
    lines.push(`Discussion: ${material.discussion.url} (${points ?? '?'} points, ${comments ?? '?'} comments)`)
  }
  return lines.join('\n\n')
}
