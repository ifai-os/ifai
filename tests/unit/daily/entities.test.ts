import { describe, expect, it } from 'vitest'

import { entityKey, storyEntities, topicOf } from '@/modules/daily/entities'
import { listHref } from '@/modules/daily/public/list-params'
import { isStoryTag, tagsOf } from '@/modules/daily/tags'

describe('companies and products of a story', () => {
  it('compares names without case, spaces or punctuation', () => {
    expect(entityKey('GPT-4o')).toBe(entityKey('gpt 4o'))
    expect(entityKey('Character.AI')).toBe('characterai')
    expect(entityKey('  ')).toBe('')
  })

  it('keeps up to three products, then up to three companies, without repeats', () => {
    const entities = storyEntities({
      products: ['MacBook Pro', 'macbook pro', 'M5', 'iPad', 'Vision Pro'],
      companies: ['Apple', 'TSMC', 'Apple', 'Intel', 'AMD'],
    })
    expect(entities.map((entity) => `${entity.kind}:${entity.name}`)).toEqual([
      'product:MacBook Pro',
      'product:M5',
      'product:iPad',
      'company:Apple',
      'company:TSMC',
      'company:Intel',
    ])
    expect(storyEntities(null)).toEqual([])
  })

  it('takes the first product as the topic, else the first company', () => {
    expect(topicOf(storyEntities({ products: [], companies: ['OpenAI'] }))?.name).toBe('OpenAI')
    expect(topicOf(storyEntities({ products: ['Sora'], companies: ['OpenAI'] }))?.name).toBe('Sora')
    expect(topicOf([])).toBeNull()
  })
})

describe('industry tags', () => {
  it('keeps known tags only, at most three', () => {
    expect(tagsOf(['chips', 'gadgets', 'chips', 'hardware', 'llm', 'voice', 'music'])).toEqual(['chips', 'hardware', 'voice'])
    expect(tagsOf(undefined)).toEqual([])
    expect(isStoryTag('on-device')).toBe(true)
  })

  it('has a list page per tag', () => {
    expect(listHref({ tag: 'chips' })).toBe('/daily/tag/chips')
    expect(listHref({ tag: 'chips', page: 2 })).toBe('/daily/tag/chips?page=2')
  })
})
