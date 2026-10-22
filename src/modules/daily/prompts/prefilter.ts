import { z } from 'zod'

import { materialText, type Material } from './material'
import { promptVersion } from './version'

const instructions = `You screen incoming items for an English-language AI news site.

Decide whether the item is about artificial intelligence: AI models, products and features, AI companies and their business, AI research, AI policy and regulation, AI infrastructure (chips, data centres, cloud for AI), or AI applications in other fields.

Be permissive. Only mark an item as not relevant when it is clearly about something else (general tech or business news with no AI angle, sports, entertainment, unrelated science). A tutorial or opinion piece about AI is still relevant here; later steps judge quality. When only a title is available, judge from the title.

Answer with JSON: { "relevant": true or false, "reason": one short sentence }.`

export const prefilterPrompt = {
  name: 'prefilter',
  version: promptVersion('prefilter', instructions),
  instructions,
  schema: z.object({ relevant: z.boolean(), reason: z.string().max(300) }),
  build: (material: Material) => materialText(material, { maxContentChars: 1500 }),
}

export type PrefilterResult = z.infer<typeof prefilterPrompt.schema>
