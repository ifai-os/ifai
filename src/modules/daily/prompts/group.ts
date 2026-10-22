import { z } from 'zod'

import { untrusted } from '@/lib/ai/untrusted'

import type { Structure } from './structure'
import { excerpt, promptVersion } from './version'

/** A report as the grouping prompt sees it: the new one, or an earlier one it may belong with. */
export type GroupReport = {
  id: number
  title: string
  summary?: string | null
  publishedAt?: Date | string | null
  sourceName: string
  facts?: Structure['facts'] | null
}

const instructions = `You decide whether a new AI news report is about the same event as earlier reports.

For each earlier report, answer one of:
- "same": it reports the same happening (the same announcement, release, deal, paper or incident), even if the wording, angle or source differs.
- "follow_up": a later development of the same story (a reaction, an update, a consequence, a new stage), which deserves its own entry linked to the earlier one.
- "unrelated": a different happening, even if the same company or product is involved.

Also say whether the new report adds information the earlier one does not have ("newInformation"): new numbers, new quotes, new details. For "unrelated" set it to false.

Answer with JSON: { "relations": [ { "id": earlier report id, "relation": "same" | "follow_up" | "unrelated", "newInformation": true or false, "reason": one short sentence } ] }, one entry per earlier report, in the order given.`

function reportText(label: string, report: GroupReport): string {
  const published = report.publishedAt ? new Date(report.publishedAt).toISOString().slice(0, 16) : 'unknown'
  const facts = report.facts?.length
    ? report.facts.map((fact) => `- ${fact.who}: ${fact.what} (${fact.when})`).join('\n')
    : '(no facts extracted)'
  return [
    `${label} (id ${report.id}, source ${report.sourceName}, published ${published}):`,
    untrusted('title', report.title),
    report.summary ? untrusted('summary', excerpt(report.summary, 800)) : '',
    `Facts:\n${facts}`,
  ]
    .filter(Boolean)
    .join('\n')
}

export const groupPrompt = {
  name: 'group',
  version: promptVersion('group', instructions),
  instructions,
  schema: z.object({
    relations: z.array(
      z.object({
        id: z.number().int(),
        relation: z.enum(['same', 'follow_up', 'unrelated']),
        newInformation: z.boolean(),
        reason: z.string().max(200),
      }),
    ),
  }),
  build: (report: GroupReport, candidates: GroupReport[]) =>
    [reportText('New report', report), ...candidates.map((candidate, i) => reportText(`Earlier report ${i + 1}`, candidate))].join(
      '\n\n',
    ),
}

export type GroupResult = z.infer<typeof groupPrompt.schema>
