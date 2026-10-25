import { describe, expect, it } from 'vitest'

import { fitScores, rankScores, rateModels, seedOf, snapshotChecksum, type Duel, type ModelScore } from '@/modules/rankings/rating'

/** `count` votes between a and b, `winsA` of them won by a, spread evenly so any run of them has the same share. */
function duels(a: number, b: number, count: number, winsA: number): Duel[] {
  const won = (index: number) => Math.floor((index * winsA) / count)
  return Array.from({ length: count }, (_, index) => ({ a, b, outcome: won(index + 1) > won(index) ? 'a' : 'b' }))
}

describe('fitScores', () => {
  it('puts 100 points between models that win 64 to 36', () => {
    const scores = fitScores(duels(1, 2, 10_000, 6_400), [1, 2])
    expect((scores.get(1) as number) - (scores.get(2) as number)).toBeCloseTo(100, 0)
    expect(((scores.get(1) as number) + (scores.get(2) as number)) / 2).toBeCloseTo(1000, 0)
  })

  it('scores a model without votes, or one that only drew, as the average', () => {
    const ties: Duel[] = [...Array.from({ length: 10 }, () => ({ a: 1, b: 2, outcome: 'tie' as const })), { a: 1, b: 2, outcome: 'bad' }]
    const scores = fitScores(ties, [1, 2, 3])
    for (const id of [1, 2, 3]) expect(scores.get(id)).toBeCloseTo(1000, 6)
  })

  it('keeps a model that only won finite, and above one that won less', () => {
    const scores = fitScores([...duels(1, 3, 5, 5), ...duels(2, 3, 5, 4)], [1, 2, 3])
    expect(Number.isFinite(scores.get(1))).toBe(true)
    expect(scores.get(1)).toBeGreaterThan(scores.get(2) as number)
    expect(scores.get(2)).toBeGreaterThan(scores.get(3) as number)
  })

  it('reads strengths through common opponents', () => {
    // 1 beats 2 and 2 beats 3, each 3 to 1; 1 and 3 never met.
    const scores = fitScores([...duels(1, 2, 400, 300), ...duels(2, 3, 400, 300)], [1, 2, 3])
    expect(scores.get(1)).toBeGreaterThan(scores.get(2) as number)
    expect(((scores.get(1) as number) - (scores.get(2) as number)) / ((scores.get(2) as number) - (scores.get(3) as number))).toBeCloseTo(1, 1)
  })
})

describe('rateModels', () => {
  const votes: Duel[] = [...duels(1, 2, 300, 200), ...duels(2, 3, 300, 180), ...duels(1, 3, 60, 50), { a: 3, b: 1, outcome: 'tie' }, { a: 2, b: 2, outcome: 'a' }]

  it('counts each model’s votes, wins, losses and draws', () => {
    const byId = new Map(rateModels(votes, { rounds: 0 }).map((score) => [score.modelId, score]))
    expect(byId.get(1)).toMatchObject({ votes: 361, wins: 250, losses: 110, ties: 1 })
    expect(byId.get(2)).toMatchObject({ votes: 600, wins: 280, losses: 320, ties: 0 })
    expect(byId.get(3)).toMatchObject({ votes: 361, wins: 130, losses: 230, ties: 1 })
    expect(rateModels([])).toEqual([])
  })

  it('gives intervals around each score, the same every time for the same seed', () => {
    const first = rateModels(votes, { seed: 7 })
    expect(rateModels(votes, { seed: 7 })).toEqual(first)
    for (const score of first) {
      expect(score.lower).toBeLessThanOrEqual(score.score)
      expect(score.upper).toBeGreaterThanOrEqual(score.score)
      expect(score.upper - score.lower).toBeGreaterThan(0)
      expect(score.upper - score.lower).toBeLessThan(150)
    }
    const fewer = rateModels(votes.slice(0, 60).concat(votes.slice(300, 360)), { seed: 7 })
    const width = (scores: ModelScore[], id: number) => {
      const score = scores.find((item) => item.modelId === id) as ModelScore
      return score.upper - score.lower
    }
    expect(width(fewer, 2)).toBeGreaterThan(width(first, 2))
  })

  it('takes a seed from text', () => {
    expect(seedOf('1:2026-10-19')).toBe(seedOf('1:2026-10-19'))
    expect(seedOf('1:2026-10-19')).not.toBe(seedOf('2:2026-10-19'))
  })
})

describe('rankScores', () => {
  const score = (modelId: number, value: number, votes: number): ModelScore => ({ modelId, score: value, lower: value - 10, upper: value + 10, votes, wins: 0, losses: 0, ties: 0 })

  it('places models with enough votes and leaves the others provisional', () => {
    const ranked = rankScores([score(1, 1000, 500), score(2, 1100, 299), score(3, 1050, 300), score(4, 1000, 800), score(5, 990, 10)])
    expect(ranked.map((row) => [row.modelId, row.rank, row.provisional])).toEqual([
      [3, 1, false],
      [4, 2, false],
      [1, 3, false],
      [2, null, true],
      [5, null, true],
    ])
  })

  it('fingerprints what a snapshot shows', () => {
    const rows = rankScores([score(1, 1050.001, 400), score(2, 990, 350)])
    const checksum = snapshotChecksum({ method: 'bradley-terry-v1', votes: 375, rows })
    expect(snapshotChecksum({ method: 'bradley-terry-v1', votes: 375, rows: rankScores([score(1, 1050.002, 400), score(2, 990, 350)]) })).toBe(checksum)
    expect(snapshotChecksum({ method: 'bradley-terry-v1', votes: 376, rows })).not.toBe(checksum)
    expect(snapshotChecksum({ method: 'bradley-terry-v1', votes: 375, rows: rankScores([score(1, 1050, 299), score(2, 990, 350)]) })).not.toBe(checksum)
  })
})
