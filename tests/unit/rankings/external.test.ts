import { describe, expect, it } from 'vitest'

import { readAaBoard } from '@/modules/rankings/external/aa'
import { splitFiles } from '@/modules/rankings/external/arena'
import { isFullSyncDay } from '@/modules/rankings/external/jobs'
import {
  aaApiKey,
  aaBoards,
  aaRowsFrom,
  arenaBoards,
  arenaSnapshotsFrom,
  boardsOf,
  externalHref,
  findBoard,
  makerName,
  monthlyPoints,
  rankByScore,
  readExternalFilters,
  weightsOf,
  type ExternalRow,
} from '@/modules/rankings/external/sources'
import { rowsChecksum } from '@/modules/rankings/external/store'

/** A row of Arena's dataset, as hyparquet reads it (the place is a BigInt, the votes a double). */
function record(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    model_name: 'Sample Pro',
    organization: 'openai',
    license: 'Proprietary',
    rating: 1500.25,
    rating_lower: 1494.5,
    rating_upper: 1506,
    vote_count: 4403,
    rank: 1n,
    category: 'overall',
    leaderboard_publish_date: '2026-10-28',
    ...overrides,
  }
}

describe('arenaSnapshotsFrom', () => {
  it('keeps the overall board, one snapshot per published day, oldest first and by place', () => {
    const { snapshots, skipped } = arenaSnapshotsFrom([
      record({ model_name: 'B', rank: 2n, rating: 1490 }),
      record({ model_name: 'A' }),
      record({ model_name: 'A', category: 'coding' }),
      record({ model_name: 'C', leaderboard_publish_date: '2026-09-30', license: 'Apache 2.0', organization: 'zai' }),
    ])
    expect(skipped).toBe(1)
    expect(snapshots.map((snapshot) => snapshot.publishedOn)).toEqual(['2026-09-30', '2026-10-28'])
    expect(snapshots[1].rows.map((row) => row.model)).toEqual(['A', 'B'])
    expect(snapshots[0].rows[0]).toEqual({
      rank: 1,
      model: 'C',
      org: 'zai',
      license: 'Apache 2.0',
      weights: 'open',
      score: 1500.25,
      lower: 1494.5,
      upper: 1506,
      votes: 4403,
    })
  })

  it('leaves out rows without a model, a score, a place or a day, and counts them', () => {
    const { snapshots, skipped } = arenaSnapshotsFrom([
      record({ model_name: ' ' }),
      record({ rating: null }),
      record({ rank: 0n }),
      record({ rank: 1.5 }),
      record({ leaderboard_publish_date: '28/10/2026' }),
      record(),
    ])
    expect(skipped).toBe(5)
    expect(snapshots).toHaveLength(1)
    expect(snapshots[0].rows).toHaveLength(1)
  })

  it('keeps two lines with the same name, as Arena lists them, and drops only an exact repeat', () => {
    const { snapshots, skipped } = arenaSnapshotsFrom([record(), record(), record({ rank: 7n, rating: 1460 })])
    expect(skipped).toBe(1)
    expect(snapshots[0].rows.map((row) => row.rank)).toEqual([1, 7])
  })
})

describe('weightsOf', () => {
  it('reads Arena’s licenses: Proprietary is closed, a license name is open weights', () => {
    expect(weightsOf('Proprietary')).toBe('closed')
    expect(weightsOf('proprietary')).toBe('closed')
    expect(weightsOf('Apache 2.0')).toBe('open')
    expect(weightsOf('Llama 3.1 Community')).toBe('open')
    expect(weightsOf('')).toBeNull()
    expect(weightsOf(null)).toBeNull()
  })
})

describe('makerName', () => {
  it('spells known makers, capitalises other keys and keeps names a source already wrote', () => {
    expect(makerName('openai')).toBe('OpenAI')
    expect(makerName('zai')).toBe('Z.ai')
    expect(makerName('bfl')).toBe('Black Forest Labs')
    expect(makerName('poolside')).toBe('Poolside')
    expect(makerName('kestrel-ai')).toBe('Kestrel AI')
    expect(makerName('Black Forest Labs')).toBe('Black Forest Labs')
    expect(makerName('Z AI')).toBe('Z AI')
    expect(makerName(null)).toBe('')
  })
})

describe('monthlyPoints', () => {
  it('takes the last published board of each month, for the latest months', () => {
    const days = ['2026-08-03', '2026-08-28', '2026-09-15', '2026-10-01', '2026-10-28'].map((day, id) => ({ id, day }))
    expect(monthlyPoints(days).map((point) => point.day)).toEqual(['2026-08-28', '2026-09-15', '2026-10-28'])
    expect(monthlyPoints([...days].reverse(), 2).map((point) => point.day)).toEqual(['2026-09-15', '2026-10-28'])
  })
})

describe('addresses', () => {
  it('puts a source’s first board at the source’s own address', () => {
    expect(externalHref('arena')).toBe('/rankings/arena')
    expect(externalHref('arena', 'text')).toBe('/rankings/arena')
    expect(externalHref('arena', 'webdev')).toBe('/rankings/arena/webdev')
    expect(externalHref('arena', 'webdev', { weights: 'open' })).toBe('/rankings/arena/webdev?weights=open')
    expect(externalHref('artificial-analysis')).toBe('/rankings/artificial-analysis')
    expect(externalHref('artificial-analysis', 'text-to-speech')).toBe('/rankings/artificial-analysis/text-to-speech')
  })

  it('finds boards by source and reads the license filter', () => {
    expect(findBoard('arena', 'vision')).toEqual({ source: 'arena', slug: 'vision', label: 'vision', digits: 0 })
    expect(findBoard('artificial-analysis', 'intelligence')?.digits).toBe(1)
    expect(findBoard('arena', 'intelligence')).toBeNull()
    expect(boardsOf('arena').map((board) => board.slug)).toEqual(arenaBoards.map((board) => board.slug))
    expect(boardsOf('artificial-analysis').map((board) => board.slug)).toEqual(aaBoards.map((board) => board.slug))
    expect(readExternalFilters({ weights: 'open' })).toEqual({ weights: 'open' })
    expect(readExternalFilters({ weights: ['closed', 'open'] })).toEqual({ weights: 'closed' })
    expect(readExternalFilters({ weights: 'all' })).toEqual({ weights: null })
  })
})

describe('aaApiKey', () => {
  it('syncs Artificial Analysis only with a key', () => {
    expect(aaApiKey({})).toBeNull()
    expect(aaApiKey({ ARTIFICIAL_ANALYSIS_API_KEY: '  ' })).toBeNull()
    expect(aaApiKey({ ARTIFICIAL_ANALYSIS_API_KEY: ' aa-key ' })).toBe('aa-key')
  })
})

describe('rankByScore', () => {
  it('places by score, equal scores sharing a place', () => {
    const row = (model: string, score: number) => ({ model, org: null, license: null, weights: null, score, lower: null, upper: null, votes: null })
    expect(rankByScore([row('C', 60), row('A', 70.5), row('B', 70.5), row('D', 50)]).map((item) => [item.model, item.rank])).toEqual([
      ['A', 1],
      ['B', 1],
      ['C', 3],
      ['D', 4],
    ])
  })
})

describe('aaRowsFrom', () => {
  const language = (name: string, index: number | null, creator: string | null = 'OpenAI') => ({
    id: name,
    name,
    slug: name.toLowerCase(),
    model_creator: creator ? { id: creator, name: creator } : null,
    evaluations: { artificial_analysis_intelligence_index: index, artificial_analysis_coding_index: null },
  })

  it('ranks language models by the Intelligence Index and leaves out the ones without it', () => {
    const { rows, skipped } = aaRowsFrom('index', [language('Small', 41.2), language('Big', 73.4, null), language('Unscored', null), 'junk'])
    expect(skipped).toBe(2)
    expect(rows).toEqual([
      { rank: 1, model: 'Big', org: null, license: null, weights: null, score: 73.4, lower: null, upper: null, votes: null },
      { rank: 2, model: 'Small', org: 'OpenAI', license: null, weights: null, score: 41.2, lower: null, upper: null, votes: null },
    ])
  })

  it('reads an arena’s Elo with its 95% interval', () => {
    const { rows, skipped } = aaRowsFrom('arena', [
      { name: 'Image One', model_creator: { name: 'OpenAI' }, elo: 1266, ci_95: 11 },
      { name: 'Image Two', model_creator: { name: 'Google' }, elo: 1270, ci_95: null },
      { name: 'Image One', model_creator: { name: 'OpenAI' }, elo: 1266, ci_95: 11 },
    ])
    expect(skipped).toBe(1)
    expect(rows.map((row) => [row.rank, row.model, row.lower, row.upper])).toEqual([
      [1, 'Image Two', null, null],
      [2, 'Image One', 1255, 1277],
    ])
  })
})

describe('readAaBoard', () => {
  const intelligence = aaBoards[0]
  const speech = aaBoards.find((board) => board.slug === 'text-to-speech')!

  it('reads every page of the language list with the key, and an arena in one request', async () => {
    const calls: { url: string; key: string | null }[] = []
    const fetcher = (async (input: string | URL, init?: RequestInit) => {
      const url = new URL(String(input))
      calls.push({ url: url.pathname + url.search, key: new Headers(init?.headers).get('x-api-key') })
      if (url.pathname.endsWith('/language/models/free')) {
        const page = Number(url.searchParams.get('page'))
        return Response.json({
          tier: 'free',
          intelligence_index_version: 5,
          pagination: { page, page_size: 1, total_pages: 2, has_more: page < 2 },
          data: [{ name: `Model ${page}`, model_creator: { name: 'Maker' }, evaluations: { artificial_analysis_intelligence_index: 50 + page } }],
        })
      }
      return Response.json({ tier: 'free', data: [{ name: 'Voice', model_creator: { name: 'Maker' }, elo: 1240, ci_95: 22 }] })
    }) as typeof fetch

    const index = await readAaBoard(intelligence, 'aa-key', fetcher)
    expect(index.requests).toBe(2)
    expect(index.rows.map((row) => row.model)).toEqual(['Model 2', 'Model 1'])
    const voices = await readAaBoard(speech, 'aa-key', fetcher)
    expect(voices.requests).toBe(1)
    expect(voices.rows[0]).toMatchObject({ rank: 1, model: 'Voice', lower: 1218, upper: 1262 })
    expect(calls.map((call) => call.url)).toEqual(['/api/v2/language/models/free?page=1', '/api/v2/language/models/free?page=2', '/api/v2/media/text-to-speech/models/free'])
    expect(calls.every((call) => call.key === 'aa-key')).toBe(true)
  })

  it('says when the daily quota is used up, and refuses a body without a list', async () => {
    const limited = (async () => new Response('{}', { status: 429, headers: { 'retry-after': '3600' } })) as typeof fetch
    await expect(readAaBoard(speech, 'aa-key', limited)).rejects.toThrow('HTTP 429 (quota resets in 3600 s)')
    const empty = (async () => Response.json({ tier: 'free' })) as typeof fetch
    await expect(readAaBoard(speech, 'aa-key', empty)).rejects.toThrow('no "data" list')
  })
})

describe('splitFiles', () => {
  it('lists one split’s parquet files of one subset, in order', () => {
    const listing = [
      { type: 'file', path: 'text_style_control/full-00001-of-00002.parquet' },
      { type: 'file', path: 'text_style_control/full-00000-of-00002.parquet' },
      { type: 'file', path: 'text_style_control/latest-00000-of-00001.parquet' },
      { type: 'file', path: 'text/full-00000-of-00001.parquet' },
      { type: 'directory', path: 'text_style_control/full-00002-of-00002.parquet' },
      'junk',
    ]
    expect(splitFiles(listing, 'text_style_control', 'full')).toEqual([
      'text_style_control/full-00000-of-00002.parquet',
      'text_style_control/full-00001-of-00002.parquet',
    ])
    expect(splitFiles(listing, 'text_style_control', 'latest')).toEqual(['text_style_control/latest-00000-of-00001.parquet'])
    expect(splitFiles({ error: 'not found' }, 'text', 'full')).toEqual([])
  })
})

describe('rowsChecksum', () => {
  it('is the same for the same rows and changes when a number does', () => {
    const rows: ExternalRow[] = arenaSnapshotsFrom([record(), record({ model_name: 'B', rank: 2n, rating: 1490 })]).snapshots[0].rows
    expect(rowsChecksum(rows)).toBe(rowsChecksum(structuredClone(rows)))
    expect(rowsChecksum(rows)).not.toBe(rowsChecksum([{ ...rows[0], votes: 4404 }, rows[1]]))
  })
})

describe('isFullSyncDay', () => {
  it('reads the whole history again on Mondays (Shanghai date)', () => {
    expect(isFullSyncDay('2026-11-02')).toBe(true)
    expect(isFullSyncDay('2026-11-03')).toBe(false)
    expect(isFullSyncDay('2026-11-01')).toBe(false)
  })
})
