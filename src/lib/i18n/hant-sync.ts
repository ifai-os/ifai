import type { CollectionAfterChangeHook, CollectionSlug } from 'payload'

import { toHant } from './hant'

/**
 * Converts every string inside a localized field value (text, hasMany text, arrays of text).
 * Array rows lose their `id`, so the zh-Hant copy gets rows of its own instead of clashing
 * with the zh-Hans ones.
 */
export function toHantDeep(value: unknown): unknown {
  if (typeof value === 'string') return toHant(value)
  if (Array.isArray(value)) return value.map(toHantDeep)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => key !== 'id')
        .map(([key, item]) => [key, toHantDeep(item)]),
    )
  }
  return value
}

const skipContextKey = 'skipHantSync'

/**
 * Payload hook: zh-Hant content is never written by hand or by a model (AGENTS.md rule 4).
 * After a save in zh-Hans, the listed localized fields are converted with OpenCC and saved
 * to zh-Hant. A field that is empty in zh-Hans is cleared in zh-Hant too, so both fall back
 * to English together.
 */
export function syncHantFromHans(fields: readonly string[]): CollectionAfterChangeHook {
  return async ({ collection, context, doc, req }) => {
    if (req.locale !== 'zh-Hans' || context[skipContextKey]) return doc

    const slug = collection.slug as CollectionSlug
    // Read zh-Hans without fallback: an English fallback must not be copied into zh-Hant.
    const hans = (await req.payload.findByID({
      collection: slug,
      id: doc.id,
      locale: 'zh-Hans',
      fallbackLocale: false,
      depth: 0,
      req,
    })) as unknown as Record<string, unknown>

    const data = Object.fromEntries(fields.map((name) => [name, toHantDeep(hans[name] ?? null)]))

    await req.payload.update({
      collection: slug,
      id: doc.id,
      locale: 'zh-Hant',
      data,
      context: { [skipContextKey]: true },
      req,
    })
    return doc
  }
}
