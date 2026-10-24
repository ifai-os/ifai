import { describe, expect, it } from 'vitest'

import { parseFollowId, parseFollowTarget } from '@/modules/follows/rules'
import { followId, readFollowId } from '@/modules/follows/target'

describe('follow ids', () => {
  it('round-trip through the address, keys with hyphens and any script included', () => {
    for (const target of [
      { type: 'tag', key: 'on-device' },
      { type: 'topic', key: 'kimi' },
      { type: 'topic', key: '月之暗面' },
      { type: 'topic', key: 'c++' },
    ] as const) {
      expect(readFollowId(followId(target))).toEqual(target)
    }
    expect(followId({ type: 'tag', key: 'llm' })).toBe('tag-llm')
  })

  it('ignores anything that is not a type and a key of a sensible length', () => {
    for (const value of [null, undefined, '', 'tag', 'tag-', 'story-12', 'TAG-llm', '-llm', 'topic- kimi', 'topic-kimi ', `topic-${'k'.repeat(101)}`]) {
      expect(readFollowId(value), String(value)).toBeNull()
    }
  })
})

describe('parseFollowTarget', () => {
  it('takes the daily’s industry tags and compared names of companies and products', () => {
    expect(parseFollowTarget('tag', 'llm')).toEqual({ type: 'tag', key: 'llm' })
    expect(parseFollowTarget('tag', 'on-device')).toEqual({ type: 'tag', key: 'on-device' })
    expect(parseFollowTarget('topic', 'macbookpro')).toEqual({ type: 'topic', key: 'macbookpro' })
    expect(parseFollowTarget('topic', '月之暗面')).toEqual({ type: 'topic', key: '月之暗面' })
  })

  it('refuses unknown tags, names that are not compared names, and other types', () => {
    expect(parseFollowTarget('tag', 'crypto')).toBeNull()
    expect(parseFollowTarget('tag', 'LLM')).toBeNull()
    // Every topic has one address: its compared name, lower case without spaces or punctuation.
    for (const key of ['MacBook Pro', 'macbook pro', 'Kimi', 'gpt-4o', '', 'k'.repeat(101)]) {
      expect(parseFollowTarget('topic', key), key).toBeNull()
    }
    expect(parseFollowTarget('story', '12')).toBeNull()
    expect(parseFollowTarget(null, 'llm')).toBeNull()
    expect(parseFollowTarget('tag', 12)).toBeNull()
  })

  it('holds ids to the same rules', () => {
    expect(parseFollowId('topic-gpt4o')).toEqual({ type: 'topic', key: 'gpt4o' })
    expect(parseFollowId('tag-crypto')).toBeNull()
    expect(parseFollowId('topic-GPT-4o')).toBeNull()
  })
})
