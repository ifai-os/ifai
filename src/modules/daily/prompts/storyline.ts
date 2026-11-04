import { z } from 'zod'

import { untrusted } from '@/lib/ai/untrusted'

import { excerpt, promptVersion } from './version'

/** A published story as the storyline prompt sees it. */
export type StorylineStory = {
  id: number
  title: string
  summary?: string | null
  publishedAt?: string | null
  entities: string[]
}

/** An ongoing storyline offered to the new story, with its latest stories. */
export type StorylineOption = {
  id: number
  name: string
  summary?: string | null
  stories: StorylineStory[]
}

const instructions = `You keep track of ongoing storylines in AI news: stories that unfold over weeks or months, each news item being one step of it. Examples: "Musk v. OpenAI" (the lawsuit, hearings, public fights and rulings between Elon Musk and OpenAI), "The EU AI Act" (drafting, votes, deadlines, enforcement), "Nvidia export restrictions to China".

You get one new published news item, a list of ongoing storylines (each with its latest items), and some earlier items that belong to no storyline yet. Decide one of:
- "join": the new item is clearly the next step of one listed storyline. Give its "storylineId".
- "new": the new item and one or more of the earlier items are clearly steps of the same ongoing storyline that is not listed yet. Give their ids in "partnerIds", and a short name and a one-sentence summary of the storyline in Simplified Chinese ("zh-Hans"), English ("en"), Japanese ("ja") and Korean ("ko"). The name names the storyline, not this item: "马斯克起诉 OpenAI", not "马斯克在庭审中作证".
- "none": anything else. This is the usual answer. Mentioning the same company or product is not enough, and neither is being the same kind of news (two companies each launching a model are two separate stories, not a storyline). Single launches, papers, funding rounds and product updates are "none" unless they are a step of a conflict, a case, a negotiation, a regulation or a saga that the other items are also steps of.

Answer with JSON: { "decision": "join" | "new" | "none", "storylineId": number or null, "partnerIds": [numbers] or null, "name": { "zh-Hans", "en", "ja", "ko" } or null, "summary": { "zh-Hans", "en", "ja", "ko" } or null, "reason": one short sentence }.`

function storyText(label: string, story: StorylineStory): string {
  const published = story.publishedAt ? story.publishedAt.slice(0, 10) : 'unknown'
  return [
    `${label} (id ${story.id}, published ${published}${story.entities.length ? `, about ${story.entities.join(', ')}` : ''}):`,
    untrusted('title', story.title),
    story.summary ? untrusted('summary', excerpt(story.summary, 500)) : '',
  ]
    .filter(Boolean)
    .join('\n')
}

const localeText = z.object({ 'zh-Hans': z.string().max(200), en: z.string().max(200), ja: z.string().max(200), ko: z.string().max(200) })

export const storylinePrompt = {
  name: 'storyline',
  version: promptVersion('storyline', instructions),
  instructions,
  schema: z.object({
    decision: z.enum(['join', 'new', 'none']),
    storylineId: z.number().int().nullable(),
    partnerIds: z.array(z.number().int()).nullable(),
    name: localeText.nullable(),
    summary: localeText.nullable(),
    reason: z.string().max(300),
  }),
  build: (story: StorylineStory, storylines: StorylineOption[], partners: StorylineStory[]) =>
    [
      storyText('New item', story),
      storylines.length
        ? `Ongoing storylines:\n\n${storylines
            .map((option) =>
              [
                `Storyline id ${option.id}: ${untrusted('name', option.name)}`,
                option.summary ? untrusted('summary', option.summary) : '',
                ...option.stories.map((other) => storyText('  Item', other)),
              ]
                .filter(Boolean)
                .join('\n'),
            )
            .join('\n\n')}`
        : 'Ongoing storylines: (none)',
      partners.length
        ? `Earlier items without a storyline:\n\n${partners.map((other) => storyText('Earlier item', other)).join('\n\n')}`
        : 'Earlier items without a storyline: (none)',
    ].join('\n\n'),
}

export type StorylineResult = z.infer<typeof storylinePrompt.schema>
