import { z } from 'zod'

import { untrusted } from '@/lib/ai/untrusted'

import { promptVersion } from './version'

const instructions = `You decide which AI news stories announce the release of a state-of-the-art model. Each story comes with its id, its date, its title and its summary.

A story counts only when it reports the release (or general availability) of a new AI model that, on that date, its maker or an independent leaderboard put at the top of its class: a frontier lab's new flagship language model, an open model that topped the main open-model leaderboards, or a new image, video, audio or speech model that led its kind. It does not count for minor or point versions, price, context or API changes, products or features built on a model, previews and announcements of future models, research results without a released model, or claims the story does not back.

Use the story's own words and what you know of that date. When unsure, leave it out.

Answer with JSON: { "sota": [the ids of the stories that count] }.`

export type SotaStory = { id: number; date: string; title: string; summary: string }

export const sotaPrompt = {
  name: 'sota',
  version: promptVersion('sota', instructions),
  instructions,
  schema: z.object({ sota: z.array(z.number().int()).max(50) }),
  build: (stories: readonly SotaStory[]) =>
    stories.map((story) => untrusted(`story ${story.id}`, [`id: ${story.id}`, `date: ${story.date}`, `title: ${story.title}`, story.summary ? `summary: ${story.summary}` : null].filter(Boolean).join('\n'))).join('\n\n'),
}

export type SotaResult = z.infer<typeof sotaPrompt.schema>
