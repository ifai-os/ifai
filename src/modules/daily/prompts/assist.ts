import { untrusted } from '@/lib/ai/untrusted'

import { promptVersion } from './version'

/** The two helpers on the review board: 缩短摘要 and 换个标题. */
export const assistKinds = ['shorten', 'title'] as const
export type AssistKind = (typeof assistKinds)[number]

const common = `You are an editor at IFAI, an AI news site. You work on the Simplified Chinese text of one story. Keep every fact as it is: never add or change names, numbers, versions, prices or dates, and keep company, product and model names in their original Latin spelling. No hype, no opinion, no exclamation marks, no emoji. Answer with the text only: no quotes, no label, no explanation.`

const instructions: Record<AssistKind, string> = {
  shorten: `${common}

Shorten the summary to at most 100 Chinese characters, keeping the answer first (what is new, then what it costs, when or where it is available, or why it matters). Drop detail before dropping the point.`,
  title: `${common}

Suggest a different title: one line of at most 30 Chinese characters that says who did what, in plain words a reader scans in a second. It must not repeat the current title.`,
}

export type AssistInput = {
  kind: AssistKind
  hans: { title: string; summary: string; tryIt: string }
  /** The reports' own titles, for reference. */
  reportTitles: string[]
}

export const assistPrompt = {
  name: 'assist',
  version: (kind: AssistKind) => promptVersion(`assist-${kind}`, instructions[kind]),
  instructions: (kind: AssistKind) => instructions[kind],
  build: ({ kind, hans, reportTitles }: AssistInput) =>
    [
      `Current title: ${hans.title}`,
      `Current summary: ${hans.summary}`,
      hans.tryIt ? `Try it: ${hans.tryIt}` : null,
      reportTitles.length ? untrusted('report titles', reportTitles.join('\n')) : null,
      kind === 'shorten' ? 'Write the shortened summary.' : 'Write the new title.',
    ]
      .filter(Boolean)
      .join('\n\n'),
}

/** The model sometimes wraps its answer in quotes or a label; keep just the text. */
export function cleanSuggestion(text: string): string {
  return text
    .trim()
    .replace(/^(标题|摘要|title|summary)\s*[:：]\s*/i, '')
    .replace(/^[「"'“]+|[」"'”]+$/g, '')
    .trim()
}
