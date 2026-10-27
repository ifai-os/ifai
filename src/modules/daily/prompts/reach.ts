import { z } from 'zod'

import { untrusted } from '@/lib/ai/untrusted'

import { promptVersion } from './version'

const instructions = `You check how widely people on X are discussing one AI news story. Search X for posts from the dates given that are about this exact story: not the company in general, not earlier news about the same product. Search by the names and key terms in the story; try other wordings if the first search finds little.

Report up to 10 of the most-engaged posts that are clearly about this story, each with its link exactly as the search returned it and the like, repost and view counts the search showed (0 when a count was not shown). Never invent a post, a link or a count. If nothing on X is about this story, answer with an empty list.

Answer with JSON: { "posts": [{ "url": string, "likes": integer, "reposts": integer, "views": integer }], "seen": integer, how many posts about this story you saw in all }.`

export type ReachInput = { title: string; topic: string | null; summary: string }

export const reachPrompt = {
  name: 'reach',
  version: promptVersion('reach', instructions),
  instructions,
  schema: z.object({
    posts: z
      .array(
        z.object({
          url: z.string(),
          likes: z.number().min(0),
          reposts: z.number().min(0),
          views: z.number().min(0),
        }),
      )
      .max(10),
    seen: z.number().int().min(0),
  }),
  build: ({ title, topic, summary }: ReachInput) =>
    untrusted('story', [`Title: ${title}`, topic ? `About: ${topic}` : null, summary ? `Summary: ${summary}` : null].filter(Boolean).join('\n')),
}

export type ReachResult = z.infer<typeof reachPrompt.schema>
