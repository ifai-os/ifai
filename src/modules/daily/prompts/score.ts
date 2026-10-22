import { z } from 'zod'

import { materialText, type Material } from './material'
import { promptVersion } from './version'

const instructions = `You are an editor at an AI news site for an international audience. Rate how newsworthy this item is for readers who follow AI, on a scale from 0 to 100.

Judge:
- Importance: who is involved and how much this changes things for users, developers, companies or the field. A new frontier model, a major product launch, a large funding round, a regulation with teeth, a notable research result score high.
- Novelty: new information, not a rehash. A minor version bump, a small feature, a reprint of old news scores low.
- Concreteness: named products, numbers, dates and availability. Vague announcements score lower.
- Reach: how many readers it affects.

Score low (under 40) for: tutorials and how-to guides, opinion and commentary, listicles, sponsored or promotional content, job posts, event announcements, routine company blog posts, content about a single small tool nobody uses.

Official sources report their own news; that is fine, judge the news itself. Do not reward sensational wording.

Answer with JSON: { "score": integer 0-100, "reason": one or two sentences naming the decisive factors }.`

export const scorePrompt = {
  name: 'score',
  version: promptVersion('score', instructions),
  instructions,
  schema: z.object({ score: z.number().int().min(0).max(100), reason: z.string().max(400) }),
  build: (material: Material) => materialText(material, { maxContentChars: 4000 }),
}

export type ScoreResult = z.infer<typeof scorePrompt.schema>
