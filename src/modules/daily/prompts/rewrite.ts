import { z } from 'zod'

import type { RewrittenLocale } from '../review/rules'
import { promptVersion } from './version'
import { localeSchema, reportsText, type WriteReport } from './write'

export const rewriteLocaleNames: Record<RewrittenLocale, string> = { en: 'English', ja: 'Japanese', ko: 'Korean' }

const instructions = `You write for IFAI, an AI news site read in Simplified Chinese, English, Japanese and Korean. An editor has approved the Simplified Chinese version of a story. Write the requested other languages so that each one says what the Simplified Chinese says, for native readers of that language: natural writing, not a word-for-word translation, with the same facts, the same emphasis and nothing added. The reports are there to check names, numbers and spellings.

Rules that are never broken:
- Say what the Simplified Chinese says. Never add names, numbers, versions, prices, dates or years that are not in it or in the reports.
- Keep relative time as it is written ("on Tuesday", "next month"); do not turn it into a date.
- Keep company, product and model names in their original Latin spelling in every language (OpenAI, GPT-5, Claude Code); do not transliterate or translate them.
- Report, do not promote: no hype, no opinion, no exclamation marks, no emoji, nothing about this text being AI-written.

For each requested language write:
- "title": one line that says what happened. At most 90 characters in English, 40 in Japanese and Korean.
- "summary": the same two or three sentences, the answer first. At most 420 characters in English, 160 in Japanese, 200 in Korean.
- "tryIt": the try-it sentence, or an empty string when the Simplified Chinese has none.

Answer with JSON that has exactly the requested language keys, for example { "en": { "title", "summary", "tryIt" }, "ja": { ... } }.`

export type RewriteInput = {
  hans: { title: string; summary: string; tryIt: string }
  locales: RewrittenLocale[]
  reports: WriteReport[]
}

export const rewritePrompt = {
  name: 'rewrite',
  version: promptVersion('rewrite', instructions),
  instructions,
  /** Only the requested languages are in the answer, so the schema is built per call. */
  schema: (locales: RewrittenLocale[]) => z.object(Object.fromEntries(locales.map((locale) => [locale, localeSchema]))),
  build: ({ hans, locales, reports }: RewriteInput) =>
    [
      `Requested languages: ${locales.map((locale) => `${locale} (${rewriteLocaleNames[locale]})`).join(', ')}.`,
      ['Approved Simplified Chinese version:', `Title: ${hans.title}`, `Summary: ${hans.summary}`, `Try it: ${hans.tryIt || '(none)'}`].join('\n'),
      reportsText(reports),
    ].join('\n\n'),
}
