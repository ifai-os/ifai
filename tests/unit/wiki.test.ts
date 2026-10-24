import { describe, expect, it } from 'vitest'

import { isLaunched } from '@/config/site'
import { entriesHref, entryHref, readEntriesParams, topicHref } from '@/modules/wiki/links'
import {
  gatherRelations,
  isEntryType,
  missingForPublish,
  otherNames,
  paragraphs,
  pickOfTheDay,
  prerequisiteLoop,
  type StoredRelations,
} from '@/modules/wiki/rules'

const complete = {
  english: {
    title: 'Agent',
    definition: 'An AI system that works toward a goal on its own.',
    explanation: 'It decides, acts and checks in a loop.',
    examples: [{ title: 'Coding agent', text: 'Fixes a failing test.' }],
    limitations: 'It makes mistakes.',
  },
  shared: {
    type: 'concept',
    topics: [3],
    sources: [{ title: 'Building effective agents', url: 'https://www.anthropic.com/engineering/building-effective-agents' }],
    reviewedAt: '2026-10-22T12:00:00.000Z',
  },
}

describe('missingForPublish (rule 4)', () => {
  it('lets a complete entry go public', () => {
    expect(missingForPublish(complete.english, complete.shared)).toEqual([])
  })

  it('names every missing English field, in the order of the back office', () => {
    expect(missingForPublish({}, {})).toEqual(['title', 'definition', 'explanation', 'examples', 'limitations', 'topics', 'sources', 'reviewedAt'])
    expect(missingForPublish({ ...complete.english, definition: '   ' }, complete.shared)).toEqual(['definition'])
  })

  it('does not count rows without their text', () => {
    expect(missingForPublish({ ...complete.english, examples: [{ title: 'Only a title', text: ' ' }] }, complete.shared)).toEqual(['examples'])
    expect(missingForPublish(complete.english, { ...complete.shared, sources: [{ title: 'No address', url: '' }] })).toEqual(['sources'])
    expect(missingForPublish(complete.english, { ...complete.shared, topics: [null] })).toEqual(['topics'])
  })

  it('asks a method for its steps, and a concept for none', () => {
    const method = { ...complete.shared, type: 'method' }
    expect(missingForPublish(complete.english, method)).toEqual(['steps'])
    expect(missingForPublish({ ...complete.english, steps: [{ title: 'Split the documents' }] }, method)).toEqual([])
  })
})

describe('prerequisiteLoop (rule 6)', () => {
  // 1 ← 2 ← 3: 3 needs 2 first, 2 needs 1 first.
  const others = new Map<number, number[]>([
    [2, [1]],
    [3, [2]],
  ])

  it('allows prerequisites that lead away from the entry', () => {
    expect(prerequisiteLoop(4, [3, 1], others)).toBeNull()
    expect(prerequisiteLoop(null, [3], others)).toBeNull()
  })

  it('finds the prerequisite that would come back round, directly or through others', () => {
    expect(prerequisiteLoop(1, [3], others)).toBe(3)
    expect(prerequisiteLoop(2, [5, 3], others)).toBe(3)
    expect(prerequisiteLoop(7, [7], others)).toBe(7)
  })

  it('stops on loops elsewhere instead of running forever', () => {
    const tangled = new Map<number, number[]>([
      [1, [2]],
      [2, [1]],
    ])
    expect(prerequisiteLoop(9, [1], tangled)).toBeNull()
  })
})

describe('gatherRelations (rule 6)', () => {
  const entry = (id: number, relations: Partial<Omit<StoredRelations, 'id'>> = {}): StoredRelations => ({
    id,
    prerequisites: [],
    related: [],
    comparisons: [],
    ...relations,
  })
  const shownAll = () => true

  it('shows two-way relations on both pages, whichever side they were filled on', () => {
    const agent = entry(1, { related: [2], comparisons: [3] })
    const injection = entry(2)
    const model = entry(3)
    const all = [agent, injection, model]
    expect(gatherRelations(injection, all, shownAll)).toEqual({ comparisons: [], prerequisites: [], next: [], related: [1] })
    expect(gatherRelations(model, all, shownAll).comparisons).toEqual([{ id: 1, from: 'other' }])
    expect(gatherRelations(agent, all, shownAll).comparisons).toEqual([{ id: 3, from: 'own' }])
  })

  it('turns other entries’ prerequisites into「Read next」', () => {
    const model = entry(1)
    const all = [model, entry(2, { prerequisites: [1] }), entry(3, { prerequisites: [1, 2] })]
    expect(gatherRelations(model, all, shownAll).next).toEqual([2, 3])
    expect(gatherRelations(all[2], all, shownAll).prerequisites).toEqual([1, 2])
  })

  it('lists every other entry once: easily confused first, then read first, read next and see also', () => {
    const agent = entry(1, { prerequisites: [2, 3], related: [2, 3, 4, 4], comparisons: [3, 3] })
    const all = [
      agent,
      entry(2),
      entry(3, { comparisons: [1] }),
      entry(4, { related: [1] }),
      entry(5, { prerequisites: [1], related: [1] }),
      entry(6, { prerequisites: [1], comparisons: [1] }),
    ]
    expect(gatherRelations(agent, all, shownAll)).toEqual({
      comparisons: [
        { id: 3, from: 'own' },
        { id: 6, from: 'other' },
      ],
      prerequisites: [2],
      next: [5],
      related: [4],
    })
  })

  it('leaves out drafts and the entry itself', () => {
    const agent = entry(1, { prerequisites: [1, 2], related: [3], comparisons: [3] })
    const all = [agent, entry(2), entry(3), entry(4, { prerequisites: [1] })]
    const published = (id: number) => id !== 3 && id !== 4
    expect(gatherRelations(agent, all, published)).toEqual({ comparisons: [], prerequisites: [2], next: [], related: [] })
  })
})

describe('otherNames (rule 7)', () => {
  it('puts the English name first on a page in another language', () => {
    expect(otherNames({ value: '智能体', lang: 'zh-Hans' }, 'Agent', { value: ['AI 智能体', '代理'], lang: 'zh-Hans' })).toEqual([
      { value: 'Agent', lang: 'en' },
      { value: 'AI 智能体', lang: 'zh-Hans' },
      { value: '代理', lang: 'zh-Hans' },
    ])
  })

  it('repeats neither the title nor another name', () => {
    expect(otherNames({ value: 'Agent', lang: 'en' }, 'Agent', { value: ['AI agent', 'agent', ' AI Agent ', ''], lang: 'en' })).toEqual([
      { value: 'AI agent', lang: 'en' },
    ])
    expect(otherNames({ value: 'Token', lang: 'zh-Hans' }, 'Token', { value: ['词元', 'token'], lang: 'zh-Hans' })).toEqual([{ value: '词元', lang: 'zh-Hans' }])
    expect(otherNames({ value: 'Harness', lang: 'ja' }, '', null)).toEqual([])
  })
})

describe('entry texts', () => {
  it('splits paragraphs on blank lines only', () => {
    expect(paragraphs('One line.\nSame paragraph.\n\nNext one.\n  \n\nLast.')).toEqual(['One line.\nSame paragraph.', 'Next one.', 'Last.'])
    expect(paragraphs('  ')).toEqual([])
  })

  it('knows the two entry types', () => {
    expect(isEntryType('concept')).toBe(true)
    expect(isEntryType('method')).toBe(true)
    for (const value of ['person', 'Concept', '', null, 1]) expect(isEntryType(value), String(value)).toBe(false)
  })
})

describe('pickOfTheDay (今日条目)', () => {
  const items = ['a', 'b', 'c']

  it('keeps one pick all day and moves to the next one the day after', () => {
    const today = pickOfTheDay(items, '2026-10-24')
    const tomorrow = pickOfTheDay(items, '2026-10-25')
    expect(today).not.toBeNull()
    expect(items.indexOf(tomorrow as string)).toBe((items.indexOf(today as string) + 1) % items.length)
    expect(pickOfTheDay(items, '2026-10-27')).toBe(today)
  })

  it('has nothing to pick from an empty list', () => {
    expect(pickOfTheDay([], '2026-10-24')).toBeNull()
  })
})

describe('Wiki addresses', () => {
  it('reads the type and page of 全部条目', () => {
    expect(readEntriesParams({})).toEqual({ type: null, page: 1 })
    expect(readEntriesParams({ type: 'method', page: '2' })).toEqual({ type: 'method', page: 2 })
    expect(readEntriesParams({ type: ['concept', 'method'], page: ['3'] })).toEqual({ type: 'concept', page: 3 })
    expect(readEntriesParams({ type: 'person' }).type).toBeNull()
    for (const page of ['0', '-1', '1.5', '01', 'x', '9999999']) expect(readEntriesParams({ page }).page, page).toBeNull()
  })

  it('writes addresses without the defaults', () => {
    expect(entriesHref()).toBe('/wiki/entries')
    expect(entriesHref({ type: 'method', page: 1 })).toBe('/wiki/entries?type=method')
    expect(entriesHref({ type: null, page: 3 })).toBe('/wiki/entries?page=3')
    expect(entryHref('sample-agent')).toBe('/wiki/sample-agent')
    expect(topicHref('sample-agents')).toBe('/wiki/topics/sample-agents')
  })

  it('belongs to the third phase', () => {
    expect(isLaunched('wiki', 1)).toBe(false)
    expect(isLaunched('wiki', 2)).toBe(false)
    expect(isLaunched('wiki', 3)).toBe(true)
  })
})
