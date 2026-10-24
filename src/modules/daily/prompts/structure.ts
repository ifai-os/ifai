import { z } from 'zod'

import { categoryGuide, storyCategories } from '../categories'
import { maxStoryTags, storyTags, tagGuide } from '../tags'
import { materialText, type Material } from './material'
import { promptVersion } from './version'

const categoryLines = storyCategories.map((key) => `- "${key}": ${categoryGuide[key]}`).join('\n')
const tagLines = storyTags.map((key) => `- "${key}": ${tagGuide[key]}`).join('\n')

const instructions = `You extract the structure of an AI news item for an editorial pipeline. Use only what the material says; never add names, numbers, versions or dates that are not in it.

Return JSON with:
- "kind": "news" when the item reports one concrete happening; "roundup" when it is a digest or newsletter that lists several unrelated stories; "insufficient" when there is not enough material to know what happened (for example only a title, or a teaser).
- "category": the one category that fits best, one of
${categoryLines}
- "tags": up to ${maxStoryTags} industry tags the news belongs to, most fitting first, only from
${tagLines}
  Give none rather than a loose fit.
- "companies": organisations the news is about (not every company mentioned), up to 10, canonical names.
- "products": products, models or services the news is about, up to 10, as named in the material.
- "facts": the main facts, up to 8, each as { "who", "what", "when" }. "when" copies the material's own wording for time (for example "on Tuesday", "next month", "2026-10-21"); write "unknown" when it gives none.
- "flags": { "promotional": true when the item mainly promotes a product, course or service rather than reporting; "tutorial": true when it is a how-to, guide or explainer rather than news }.`

export const structurePrompt = {
  name: 'structure',
  version: promptVersion('structure', instructions),
  instructions,
  schema: z.object({
    kind: z.enum(['news', 'roundup', 'insufficient']),
    category: z.enum(storyCategories),
    tags: z.array(z.enum(storyTags)).max(maxStoryTags),
    companies: z.array(z.string().max(100)).max(10),
    products: z.array(z.string().max(100)).max(10),
    facts: z.array(z.object({ who: z.string().max(200), what: z.string().max(400), when: z.string().max(100) })).max(8),
    flags: z.object({ promotional: z.boolean(), tutorial: z.boolean() }),
  }),
  build: (material: Material) => materialText(material, { maxContentChars: 6000 }),
}

export type Structure = z.infer<typeof structurePrompt.schema>
