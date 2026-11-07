import { z } from 'zod'

import { untrusted } from '@/lib/ai/untrusted'

import { X_TOP_POSTS } from '../heat/external/rules'

import { promptVersion } from './version'

const instructions = `You measure how many people on X saw one AI news story. Search X for posts from the dates given that are about this exact story.

What counts: a post about this one happening (the release, deal or result in the story), in any language. What does not: posts about the company or product in general, about earlier news of the same product, replies, and reposts of a post you already have. When unsure whether a post is about this story, leave it out.
For example, for "OpenAI releases GPT-6": a post sharing the GPT-6 announcement counts; a post about ChatGPT's outage last week does not.

Search by the names and key terms in the story. Try at most one other wording; if neither search finds posts about the story, answer with an empty list.

Report the ${X_TOP_POSTS} posts about this story with the most views, each with its link exactly as the search returned it and the view count the search showed. Leave out a post whose view count was not shown. Never invent a post, a link or a number.

Answer with JSON: { "posts": [{ "url": string, "views": integer }] }.`

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
          views: z.number().min(0),
        }),
      )
      .max(10),
  }),
  build: ({ title, topic, summary }: ReachInput) =>
    untrusted('story', [`Title: ${title}`, topic ? `About: ${topic}` : null, summary ? `Summary: ${summary}` : null].filter(Boolean).join('\n')),
}

export type ReachResult = z.infer<typeof reachPrompt.schema>
