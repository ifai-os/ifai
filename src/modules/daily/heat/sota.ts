/**
 * Marking earlier landmark stories (2026-11-07 站长: Claude ticks them, not the editors): a
 * state-of-the-art model release, or research that changes a field (AlphaFold, AI settling open
 * problems in mathematics). Stories written since then are judged by the structuring step, and an
 * editor's tick counts as judged too; the rest — published model, open-source and generated-media
 * stories — go to the model in batches, once each. Saving a story recomputes its importance and
 * reach index (../collections/stories.ts).
 */
import { ai } from '@/lib/ai'
import { getDb } from '@/lib/db/drizzle'

import type { StoryCategory } from '../categories'
import { sotaPrompt } from '../prompts'

/** Where landmarks are filed: models, open models, image / video / audio models, research and robotics. */
export const SOTA_CATEGORIES: readonly StoryCategory[] = ['llm', 'open', 'aigc', 'research', 'robotics']
/** Stories per model call. */
export const SOTA_BATCH = 20

/** The ids the model named that are among the batch, each once. */
export function sotaIds(named: readonly number[], batch: readonly number[]): number[] {
  const known = new Set(batch)
  return [...new Set(named.filter((id) => known.has(id)))]
}

export type SotaRun = { judged: number; marked: number[] }

/** Judge one batch of stories not judged yet, oldest first; mark the SOTA ones and the rest as judged. */
export async function judgeSotaBatch(): Promise<SotaRun> {
  const { payload } = await getDb()
  const { docs } = await payload.find({
    collection: 'stories',
    where: { and: [{ status: { equals: 'published' } }, { category: { in: [...SOTA_CATEGORIES] } }, { sotaJudged: { not_equals: true } }] },
    sort: 'publishedAt',
    limit: SOTA_BATCH,
    depth: 0,
    locale: 'en',
    select: { title: true, summary: true, publishedAt: true, createdAt: true },
  })
  if (!docs.length) return { judged: 0, marked: [] }
  const stories = docs.map((doc) => ({
    id: doc.id,
    date: (doc.publishedAt ?? doc.createdAt).slice(0, 10),
    title: doc.title ?? '',
    summary: doc.summary ?? '',
  }))
  const { output } = await ai.object({
    purpose: 'structure',
    subject: `stories:${stories[0].id}-${stories.at(-1)!.id}`,
    instructions: sotaPrompt.instructions,
    prompt: sotaPrompt.build(stories),
    schema: sotaPrompt.schema,
    temperature: 0,
  })
  const marked = sotaIds(output.sota, stories.map((story) => story.id))
  for (const story of stories) {
    await payload.update({ collection: 'stories', id: story.id, data: { sota: marked.includes(story.id), sotaJudged: true }, depth: 0, context: { sotaJudge: true } })
  }
  return { judged: stories.length, marked }
}
