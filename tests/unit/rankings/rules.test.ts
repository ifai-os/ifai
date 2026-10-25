import { describe, expect, it } from 'vitest'

import { isLaunched } from '@/config/site'
import {
  answerParts,
  arenaBudgetUsd,
  boardHref,
  giveawayWords,
  isBattleId,
  isCountedVote,
  isOpenBattle,
  namesItself,
  parseOpenInput,
  parseVoteInput,
  promptLangFor,
  readBoardFilters,
  topMakers,
  trendGap,
  valueFrontier,
  voteHref,
  weekOf,
} from '@/modules/rankings/rules'

describe('launch', () => {
  it('opens the rankings in the third phase only', () => {
    expect(isLaunched('rankings', 1)).toBe(false)
    expect(isLaunched('rankings', 2)).toBe(false)
    expect(isLaunched('rankings', 3)).toBe(true)
  })
})

describe('arenaBudgetUsd', () => {
  it('reads a number of dollars, zero included, and falls back to $2', () => {
    expect(arenaBudgetUsd({})).toBe(2)
    expect(arenaBudgetUsd({ ARENA_DAILY_BUDGET_USD: '5.5' })).toBe(5.5)
    expect(arenaBudgetUsd({ ARENA_DAILY_BUDGET_USD: '0' })).toBe(0)
    for (const raw of ['', ' ', '-1', 'ten', 'Infinity']) expect(arenaBudgetUsd({ ARENA_DAILY_BUDGET_USD: raw })).toBe(2)
  })
})

describe('votes', () => {
  const opened = new Date('2026-10-24T10:00:00Z')
  const later = (ms: number) => new Date(opened.getTime() + ms)

  it('counts a vote only after four seconds of reading', () => {
    expect(isCountedVote(opened, later(3999))).toBe(false)
    expect(isCountedVote(opened, later(4000))).toBe(true)
  })

  it('takes a vote for two hours after the question opened', () => {
    expect(isOpenBattle(opened, later(2 * 60 * 60 * 1000))).toBe(true)
    expect(isOpenBattle(opened, later(2 * 60 * 60 * 1000 + 1))).toBe(false)
  })

  it('reads the open and vote requests', () => {
    expect(parseOpenInput({ locale: 'en' })).toEqual({ arena: null, locale: 'en' })
    expect(parseOpenInput({ arena: '', locale: 'ja' })).toEqual({ arena: null, locale: 'ja' })
    expect(parseOpenInput({ arena: 'coding', locale: 'zh-Hant' })).toEqual({ arena: 'coding', locale: 'zh-Hant' })
    for (const body of [null, 'en', {}, { locale: 'xx' }, { arena: 'Coding', locale: 'en' }, { arena: 5, locale: 'en' }, { arena: 'a'.repeat(81), locale: 'en' }]) {
      expect(parseOpenInput(body)).toBeNull()
    }
    expect(parseVoteInput({ outcome: 'tie', locale: 'ko' })).toEqual({ outcome: 'tie', locale: 'ko' })
    for (const body of [null, { outcome: 'a' }, { outcome: 'maybe', locale: 'en' }, { outcome: 'A', locale: 'en' }]) expect(parseVoteInput(body)).toBeNull()
  })

  it('knows a question id when it sees one', () => {
    expect(isBattleId('AbC-_123456789012345678x')).toBe(true)
    for (const value of ['short', 'AbC-_123456789012345678x9', 'AbC-_12345678901234567/x', 42, null]) expect(isBattleId(value)).toBe(false)
  })
})

describe('questions and answers', () => {
  it('gives Traditional Chinese pages the Simplified questions', () => {
    expect(promptLangFor('zh-Hant')).toBe('zh-Hans')
    expect(promptLangFor('ja')).toBe('ja')
  })

  it('finds the words that would give a model away', () => {
    expect(giveawayWords({ name: 'Gemini 2.5 Flash', org: ['Google'] })).toEqual(['gemini', 'google'])
    expect(giveawayWords({ name: 'Qwen3 Max', org: ['Alibaba', '阿里巴巴'] })).toEqual(['qwen3', 'qwen', 'alibaba', '阿里巴巴'])
    expect(giveawayWords({ name: 'Kimi K2', org: ['Moonshot AI', '月之暗面'] })).toEqual(['kimi', 'moonshot', '月之暗面'])
  })

  it('flags an answer that names its model or maker', () => {
    const kimi = { name: 'Kimi K2', org: ['Moonshot AI', '月之暗面'] }
    expect(namesItself('Hi, I am Kimi.', kimi)).toBe(true)
    expect(namesItself('我是月之暗面开发的助手。', kimi)).toBe(true)
    expect(namesItself('The K2 summit is 8,611 m high.', kimi)).toBe(false)
    expect(namesItself('The Geminid meteor shower peaks in December.', { name: 'Gemini 2.5 Pro', org: ['Google'] })).toBe(false)
    expect(namesItself('As Gemini, I can help.', { name: 'Gemini 2.5 Pro', org: ['Google'] })).toBe(true)
  })

  it('splits an answer into text and fenced code, keeping everything else as text', () => {
    expect(answerParts('Here:\n\n```python\nprint("hi")\n```\n\nDone. <b>not bold</b>')).toEqual([
      { kind: 'text', text: 'Here:' },
      { kind: 'code', text: 'print("hi")', lang: 'python' },
      { kind: 'text', text: 'Done. <b>not bold</b>' },
    ])
    expect(answerParts('~~~\na\n```\nb\n~~~')).toEqual([{ kind: 'code', text: 'a\n```\nb', lang: null }])
    expect(answerParts('Start\r\n```js\nlet x')).toEqual([
      { kind: 'text', text: 'Start' },
      { kind: 'code', text: 'let x', lang: 'js' },
    ])
    expect(answerParts('\n\n')).toEqual([])
  })
})

describe('the rankings page', () => {
  it('keeps the models nothing beats on both cost and score, cheapest first', () => {
    const points = [
      { id: 'a', costUsd: 0.01, score: 1100 },
      { id: 'b', costUsd: 0.001, score: 1000 },
      { id: 'c', costUsd: 0.005, score: 990 },
      { id: 'd', costUsd: 0.02, score: 1050 },
      { id: 'e', costUsd: 0.001, score: 950 },
    ]
    expect(valueFrontier(points).map((point) => point.id)).toEqual(['b', 'a'])
    expect(valueFrontier([])).toEqual([])
  })

  it('reads the filters from the address and writes them back', () => {
    expect(readBoardFilters({ weights: 'open', region: 'cn' })).toEqual({ weights: 'open', region: 'cn' })
    expect(readBoardFilters({ weights: ['closed', 'open'], region: 'mars' })).toEqual({ weights: 'closed', region: null })
    expect(readBoardFilters({})).toEqual({ weights: null, region: null })
    expect(boardHref(null)).toBe('/rankings')
    expect(boardHref('coding', { weights: 'open', region: 'cn' })).toBe('/rankings/coding?weights=open&region=cn')
    expect(boardHref(null, { weights: null, region: 'eu' })).toBe('/rankings?region=eu')
    expect(voteHref(null)).toBe('/rankings/vote')
    expect(voteHref('coding')).toBe('/rankings/vote?arena=coding')
  })

  it('measures the gap between closed and open weights from the first to the last week with both', () => {
    expect(
      trendGap([
        { week: '2026-09-28', open: null, closed: 1100 },
        { week: '2026-10-05', open: 1001.4, closed: 1100 },
        { week: '2026-10-12', open: 1030, closed: 1095 },
        { week: '2026-10-19', open: 1050, closed: null },
      ]),
    ).toEqual({ from: 99, to: 65 })
    expect(trendGap([{ week: '2026-10-19', open: 1000, closed: 1100 }])).toBeNull()
  })

  it('files a Shanghai day under its week’s Monday', () => {
    expect(weekOf('2026-10-19')).toBe('2026-10-19')
    expect(weekOf('2026-10-24')).toBe('2026-10-19')
    expect(weekOf('2026-10-25')).toBe('2026-10-19')
    expect(weekOf('2026-10-26')).toBe('2026-10-26')
    expect(weekOf('2027-01-01')).toBe('2026-12-28')
  })

  it('counts each maker’s models among the first 30 places', () => {
    const rows = [
      { rank: 1, org: 'Lumen Labs' },
      { rank: 2, org: 'Atlas AI' },
      { rank: 3, org: 'Kestrel AI' },
      { rank: 4, org: 'Kestrel AI' },
      { rank: 5, org: 'Lumen Labs' },
      { rank: 6, org: 'Orchid' },
      { rank: 7, org: 'Basalt' },
      { rank: 8, org: 'Tundra' },
      { rank: 31, org: 'Orchid' },
      { rank: null, org: 'Orchid' },
      { rank: 9, org: '' },
    ]
    expect(topMakers(rows)).toEqual([
      { org: 'Lumen Labs', models: 2 },
      { org: 'Kestrel AI', models: 2 },
      { org: 'Atlas AI', models: 1 },
      { org: 'Orchid', models: 1 },
      { org: 'Basalt', models: 1 },
    ])
  })
})
