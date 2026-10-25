import { normalizeName } from '@/modules/apps/metrics/match'

import type { Structure } from './prompts/structure'

/**
 * The companies and products a story is about (docs/specs/daily.md「涉及的公司与产品」「话题追踪」),
 * from the structuring step's result. `key` is what stories are compared by: lower case,
 * without spaces or punctuation, so "GPT-4o" and "gpt 4o" are one topic.
 */
export const entityKinds = ['company', 'product'] as const
export type EntityKind = (typeof entityKinds)[number]

export type StoryEntity = { name: string; kind: EntityKind; key: string }

const perKind = 3

export function entityKey(name: string): string {
  return normalizeName(name).replace(/[\s'"’“”]+/g, '')
}

/** Up to three products, then up to three companies, without repeats. */
export function storyEntities(structure: Pick<Structure, 'companies' | 'products'> | null | undefined): StoryEntity[] {
  const result: StoryEntity[] = []
  const add = (names: readonly string[] | undefined, kind: EntityKind) => {
    let added = 0
    for (const raw of names ?? []) {
      const name = raw.trim()
      const key = entityKey(name)
      if (!key || result.some((entity) => entity.key === key)) continue
      result.push({ name, kind, key })
      if (++added === perKind) break
    }
  }
  add(structure?.products, 'product')
  add(structure?.companies, 'company')
  return result
}

/** The story's topic: its first product, else its first company; null when it has neither. */
export function topicOf(entities: readonly StoryEntity[]): StoryEntity | null {
  return entities.find((entity) => entity.kind === 'product') ?? entities[0] ?? null
}
