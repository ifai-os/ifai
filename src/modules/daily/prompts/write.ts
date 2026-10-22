import { z } from 'zod'

import { untrusted } from '@/lib/ai/untrusted'

import type { SourceTier } from '../types'
import { tierWords } from './material'
import type { Structure } from './structure'
import { excerpt, promptVersion } from './version'

/** One member report of the event, as the writing prompt sees it. */
export type WriteReport = {
  sourceName: string
  tier: SourceTier
  url: string
  publishedAt?: Date | string | null
  title: string
  summary?: string | null
  content?: string | null
  facts?: Structure['facts'] | null
  /** Background only: the earlier report this one follows up. */
  background?: boolean
}

const instructions = `You write for IFAI, an AI news site read in Simplified Chinese, English, Japanese and Korean. From the reports below, write the same story four times, once per language, each for native readers of that language: natural writing, not a translation of another version.

Rules that are never broken:
- Use only what the reports say. Never add names, numbers, versions, prices, dates or years that are not in them. When reports disagree, follow the official source, then the earliest report.
- Copy relative time the way the reports say it ("on Tuesday", "next month", "later this year"); do not turn it into a date.
- Keep company, product and model names in their original Latin spelling in every language (OpenAI, GPT-5, Claude Code); do not transliterate or translate them.
- Report, do not promote: no hype, no opinion, no exclamation marks, no emoji, nothing about this text being AI-written.
- A report marked as background is context for a follow-up; the story is about the newest report.

For each language write:
- "title": one line that says what happened (who did what). At most 30 characters in Chinese and Japanese, 40 in Korean, 90 in English.
- "summary": two or three sentences, the answer first: what is new, then what it costs, when and where it is available, or why it matters. At most 160 characters in Chinese and Japanese, 200 in Korean, 420 in English.
- "tryIt": one sentence telling the reader a concrete thing they can do now (where to try it, how to get access), only when the reports give it; otherwise an empty string.

Also give "slug": a short English URL slug for the story, three to eight words, lowercase letters, digits and hyphens only, for example "openai-launches-chatgpt-slides".

Answer with JSON: { "slug": "...", "zhHans": { "title", "summary", "tryIt" }, "en": { ... }, "ja": { ... }, "ko": { ... } }.`

const localeSchema = z.object({
  title: z.string().min(1).max(200),
  summary: z.string().min(1).max(1200),
  tryIt: z.string().max(400),
})

export type WrittenLocaleKey = 'zhHans' | 'en' | 'ja' | 'ko'

/** JSON keys in the model's answer → Payload locales. zh-Hant is converted from zh-Hans, never written. */
export const writtenLocales = { zhHans: 'zh-Hans', en: 'en', ja: 'ja', ko: 'ko' } as const

function reportText(index: number, report: WriteReport): string {
  const published = report.publishedAt ? new Date(report.publishedAt).toISOString().slice(0, 16) : 'unknown'
  const label = report.background ? `Background report ${index}` : `Report ${index}`
  const lines = [
    `${label} — ${report.sourceName} (${tierWords[report.tier]}), published ${published}, ${report.url}`,
    untrusted('title', report.title),
  ]
  if (report.content) lines.push(untrusted('article', excerpt(report.content, 3500)))
  else if (report.summary) lines.push(untrusted('summary', excerpt(report.summary, 1500)))
  else lines.push('(only the title is available)')
  if (report.facts?.length) {
    lines.push(`Extracted facts:\n${report.facts.map((fact) => `- ${fact.who}: ${fact.what} (${fact.when})`).join('\n')}`)
  }
  return lines.join('\n')
}

export const writePrompt = {
  name: 'write',
  version: promptVersion('write', instructions),
  instructions,
  schema: z.object({
    slug: z.string().min(3).max(80),
    zhHans: localeSchema,
    en: localeSchema,
    ja: localeSchema,
    ko: localeSchema,
  }),
  /** Reports come most authoritative first; the first one is the story's main source. */
  build: (reports: WriteReport[]) =>
    [`${reports.length} report(s) of the same event, most authoritative first.`, ...reports.map((report, i) => reportText(i + 1, report))].join(
      '\n\n',
    ),
}

export type WriteResult = z.infer<typeof writePrompt.schema>
export type WrittenText = z.infer<typeof localeSchema>
