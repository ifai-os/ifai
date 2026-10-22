import { z } from 'zod'

import { htmlListConfigSchema } from './types'

/** How a source is read: a feed, a list page with selectors, or a JSON API. */
export const sourceTypes = ['rss', 'html_list', 'json'] as const
export type SourceType = (typeof sourceTypes)[number]

/** JSON sources we know how to read. Only Hacker News for now. */
export const jsonConfigSchema = z.object({
  kind: z.literal('hacker_news'),
  /** Stories below this score are ignored. */
  minPoints: z.number().int().min(0).optional(),
})

export type JsonConfig = z.infer<typeof jsonConfigSchema>

/** Payload field validation for `config`, by the source's type. Returns true or a message. */
export function validateSourceConfig(type: unknown, config: unknown): string | true {
  switch (type) {
    case 'rss':
      return true
    case 'html_list': {
      if (config == null) return 'A web-list source needs selectors: at least { "item": "<css selector>" }.'
      const result = htmlListConfigSchema.safeParse(config)
      return result.success ? true : `Selectors: ${describe(result.error)}`
    }
    case 'json': {
      if (config == null) return 'A JSON source needs { "kind": "hacker_news" }.'
      const result = jsonConfigSchema.safeParse(config)
      return result.success ? true : `Config: ${describe(result.error)}`
    }
    default:
      return 'Pick a source type first.'
  }
}

/** A URL we can fetch. */
export function validateSourceUrl(value: unknown): string | true {
  if (typeof value !== 'string' || !value.trim()) return 'Required.'
  try {
    const url = new URL(value.trim())
    return url.protocol === 'http:' || url.protocol === 'https:' ? true : 'Must start with http:// or https://.'
  } catch {
    return 'Not a valid URL.'
  }
}

function describe(error: z.ZodError): string {
  return error.issues.map((issue) => `${issue.path.join('.') || 'value'} ${issue.message}`).join('; ')
}
