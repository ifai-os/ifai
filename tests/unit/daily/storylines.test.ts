import { describe, expect, it } from 'vitest'

import { storylinePrompt } from '@/modules/daily/prompts'
import { readDecision, storylineSince, storylineSlug } from '@/modules/daily/storylines/rules'

const names = { 'zh-Hans': '马斯克起诉 OpenAI', en: 'Musk v. OpenAI', ja: 'マスク対OpenAI', ko: '머스크 대 OpenAI' }
const offered = { storylines: [3, 7], partners: [11, 12] }

describe('the storyline answer', () => {
  it('joins only a storyline it was offered', () => {
    expect(readDecision({ decision: 'join', storylineId: 7 }, offered)).toEqual({ kind: 'join', storylineId: 7 })
    expect(readDecision({ decision: 'join', storylineId: 99 }, offered)).toEqual({ kind: 'none' })
    expect(readDecision({ decision: 'join', storylineId: null }, offered)).toEqual({ kind: 'none' })
  })

  it('starts one only with offered stories and a name in every written language', () => {
    expect(readDecision({ decision: 'new', partnerIds: [11, 11, 40], name: names, summary: { en: ' The lawsuit. ' } }, offered)).toEqual({
      kind: 'new',
      partnerIds: [11],
      name: names,
      summary: { 'zh-Hans': '', en: 'The lawsuit.', ja: '', ko: '' },
    })
    expect(readDecision({ decision: 'new', partnerIds: [40], name: names }, offered)).toEqual({ kind: 'none' })
    expect(readDecision({ decision: 'new', partnerIds: [12], name: { ...names, ko: ' ' } }, offered)).toEqual({ kind: 'none' })
  })

  it('reads anything else as none', () => {
    expect(readDecision({ decision: 'none' }, offered)).toEqual({ kind: 'none' })
  })
})

describe('storyline rules', () => {
  it('offers storylines of the last 90 days', () => {
    expect(storylineSince(new Date('2026-11-04T00:00:00Z')).toISOString()).toBe('2026-08-06T00:00:00.000Z')
  })

  it('makes an English slug, else one from the id', () => {
    expect(storylineSlug('Musk v. OpenAI', 5)).toBe('musk-v-openai')
    expect(storylineSlug('マスク', 5)).toBe('storyline-5')
  })
})

describe('the storyline prompt', () => {
  it('wraps every outside text and lists the storylines and loose stories by id', () => {
    const text = storylinePrompt.build(
      { id: 1, title: 'Musk testifies', summary: 'He said…', publishedAt: '2026-11-03T10:00:00Z', entities: ['OpenAI', 'xAI'] },
      [{ id: 3, name: 'Musk v. OpenAI', summary: null, stories: [{ id: 2, title: 'Trial opens', publishedAt: '2026-10-30T10:00:00Z', entities: [] }] }],
      [],
    )
    expect(text).toContain('New item (id 1, published 2026-11-03, about OpenAI, xAI)')
    expect(text).toContain('Storyline id 3')
    expect(text).toContain('Item (id 2, published 2026-10-30)')
    expect(text).toContain('Earlier items without a storyline: (none)')
    expect(text).toContain('<external_data source="title">\nMusk testifies\n</external_data>')
    expect(storylinePrompt.instructions).toContain('Mentioning the same company or product is not enough')
  })
})
