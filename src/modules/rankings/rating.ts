import { createHash } from 'node:crypto'

import { stableStringify } from '@/lib/ai/receipts'

import { PROVISIONAL_UNDER, type Outcome } from './rules'

/**
 * Scores from the arena's votes (docs/specs/rankings.md rules 8 and 9): a Bradley–Terry model
 * fitted to every counted vote, on the Elo scale (400 points per factor of ten in the odds),
 * with 95% intervals from resampling the votes. Pure, so the weekly job and the tests share it.
 */

/** One counted vote: the two models and how it went. */
export type Duel = { a: number; b: number; outcome: Outcome }

/** Recorded with every snapshot, so a change of method shows in the history. */
export const RATING_METHOD = 'bradley-terry-v1'

/** Score of the average model, and points per factor of ten in the odds of winning. */
export const BASE_SCORE = 1000
export const SCALE = 400

/**
 * Every model also plays this many virtual games, half won, against an average opponent. It keeps
 * a model that has only won (or only lost) finite and pulls models with few votes toward the
 * middle; with hundreds of votes it hardly moves a score.
 */
const PRIOR_GAMES = 2
const MAX_ROUNDS = 1000
const TOLERANCE = 1e-9

/** Bootstrap rounds for the intervals. */
export const BOOTSTRAP_ROUNDS = 100

type Pair = { i: number; j: number; games: number; winsI: number }

/** Win counts per pair of models, a draw (「差不多」「都不好」) half a win each. */
function tally(duels: readonly Duel[], index: Map<number, number>): { pairs: Pair[]; wins: number[] } {
  const byPair = new Map<number, Pair>()
  const wins = new Array<number>(index.size).fill(0)
  for (const duel of duels) {
    const a = index.get(duel.a)
    const b = index.get(duel.b)
    if (a === undefined || b === undefined || a === b) continue
    const [i, j] = a < b ? [a, b] : [b, a]
    const key = i * index.size + j
    const pair = byPair.get(key) ?? { i, j, games: 0, winsI: 0 }
    pair.games += 1
    const pointsA = duel.outcome === 'a' ? 1 : duel.outcome === 'b' ? 0 : 0.5
    const pointsI = a === i ? pointsA : 1 - pointsA
    pair.winsI += pointsI
    wins[i] += pointsI
    wins[j] += 1 - pointsI
    byPair.set(key, pair)
  }
  return { pairs: [...byPair.values()], wins }
}

/**
 * The votes fix the strengths only relative to each other; their common scale comes from the
 * virtual games alone, at Σ (1 − p) / (1 + p) = 0. The MM steps creep toward it, so each round
 * sets it directly (Newton's method on the log of the factor).
 */
function rescale(strength: readonly number[]): number[] {
  let log = 0
  for (let step = 0; step < 50; step++) {
    let value = 0
    let slope = 0
    for (const p of strength) {
      const q = Math.exp(log) * p
      value += (1 - q) / (1 + q)
      slope -= (2 * q) / (1 + q) ** 2
    }
    const move = Math.max(-1, Math.min(1, value / slope))
    log -= move
    if (Math.abs(move) < 1e-12) break
  }
  return strength.map((p) => p * Math.exp(log))
}

/**
 * The strengths (odds against the average opponent) by Hunter's MM algorithm, which only ever
 * moves toward the maximum of the likelihood. Returns scores in the same order as `models`.
 */
function fit(models: number, pairs: readonly Pair[], wins: readonly number[]): number[] {
  let strength = new Array<number>(models).fill(1)
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const denominator = strength.map((p) => PRIOR_GAMES / (p + 1))
    for (const pair of pairs) {
      const share = pair.games / (strength[pair.i] + strength[pair.j])
      denominator[pair.i] += share
      denominator[pair.j] += share
    }
    const next = rescale(strength.map((_, k) => (wins[k] + PRIOR_GAMES / 2) / denominator[k]))
    const change = Math.max(...next.map((p, k) => Math.abs(Math.log(p) - Math.log(strength[k]))))
    strength = next
    if (change < TOLERANCE) break
  }
  return strength.map((p) => BASE_SCORE + SCALE * Math.log10(p))
}

/** Scores for the models, from the votes among them; a model without votes scores the average. */
export function fitScores(duels: readonly Duel[], models: readonly number[]): Map<number, number> {
  const index = new Map(models.map((id, k) => [id, k]))
  const { pairs, wins } = tally(duels, index)
  const scores = fit(models.length, pairs, wins)
  return new Map(models.map((id, k) => [id, scores[k]]))
}

/** Small, seeded and fast: the same votes and seed always give the same intervals. */
function random(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** The value below which `share` of the sorted values lie, interpolating between neighbours. */
function quantile(sorted: readonly number[], share: number): number {
  if (sorted.length === 0) return Number.NaN
  const position = (sorted.length - 1) * share
  const below = Math.floor(position)
  const above = Math.min(sorted.length - 1, below + 1)
  return sorted[below] + (sorted[above] - sorted[below]) * (position - below)
}

/** A seed from text, e.g. the arena and the week, so a recomputed week gives the same intervals. */
export function seedOf(text: string): number {
  return createHash('sha256').update(text).digest().readUInt32LE(0)
}

export type ModelScore = {
  modelId: number
  score: number
  /** The 95% interval of the score. */
  lower: number
  upper: number
  votes: number
  wins: number
  losses: number
  /** 「差不多」and「都不好」. */
  ties: number
}

/**
 * Scores with intervals and vote counts for every model that has a vote. The intervals come
 * from refitting `rounds` resamples of the votes (drawn with replacement).
 */
export function rateModels(duels: readonly Duel[], { rounds = BOOTSTRAP_ROUNDS, seed = 1 }: { rounds?: number; seed?: number } = {}): ModelScore[] {
  const counts = new Map<number, { votes: number; wins: number; losses: number; ties: number }>()
  const count = (id: number) => {
    const entry = counts.get(id) ?? { votes: 0, wins: 0, losses: 0, ties: 0 }
    counts.set(id, entry)
    return entry
  }
  for (const duel of duels) {
    if (duel.a === duel.b) continue
    const a = count(duel.a)
    const b = count(duel.b)
    a.votes += 1
    b.votes += 1
    if (duel.outcome === 'a') {
      a.wins += 1
      b.losses += 1
    } else if (duel.outcome === 'b') {
      b.wins += 1
      a.losses += 1
    } else {
      a.ties += 1
      b.ties += 1
    }
  }
  const models = [...counts.keys()].sort((a, b) => a - b)
  if (models.length === 0) return []
  const index = new Map(models.map((id, k) => [id, k]))
  const { pairs, wins } = tally(duels, index)
  const scores = fit(models.length, pairs, wins)

  const next = random(seed)
  const samples = models.map(() => [] as number[])
  for (let round = 0; round < rounds; round++) {
    const resample = Array.from({ length: duels.length }, () => duels[Math.floor(next() * duels.length)])
    const tallied = tally(resample, index)
    fit(models.length, tallied.pairs, tallied.wins).forEach((score, k) => samples[k].push(score))
  }

  return models.map((modelId, k) => {
    const sorted = samples[k].sort((a, b) => a - b)
    const lower = rounds > 0 ? Math.min(quantile(sorted, 0.025), scores[k]) : scores[k]
    const upper = rounds > 0 ? Math.max(quantile(sorted, 0.975), scores[k]) : scores[k]
    return { modelId, score: scores[k], lower, upper, ...(counts.get(modelId) as NonNullable<ReturnType<typeof counts.get>>) }
  })
}

export type RankedScore = ModelScore & {
  /** 1, 2, 3… for models with enough votes; null while provisional. */
  rank: number | null
  provisional: boolean
}

/**
 * Places (rule 9): models with enough votes by score, then votes, then id; provisional ones after
 * them by score, without a place.
 */
export function rankScores(scores: readonly ModelScore[], provisionalUnder: number = PROVISIONAL_UNDER): RankedScore[] {
  const order = (a: ModelScore, b: ModelScore) => b.score - a.score || b.votes - a.votes || a.modelId - b.modelId
  const ranked = scores.filter((score) => score.votes >= provisionalUnder).sort(order)
  const provisional = scores.filter((score) => score.votes < provisionalUnder).sort(order)
  return [
    ...ranked.map((score, k) => ({ ...score, rank: k + 1, provisional: false })),
    ...provisional.map((score) => ({ ...score, rank: null, provisional: true })),
  ]
}

/** A fingerprint of what a snapshot shows, so a stored one can be checked against its rows. */
export function snapshotChecksum(input: { method: string; votes: number; rows: readonly RankedScore[] }): string {
  const rounded = (value: number) => Math.round(value * 100) / 100
  const rows = input.rows.map((row) => ({
    model: row.modelId,
    rank: row.rank,
    score: rounded(row.score),
    lower: rounded(row.lower),
    upper: rounded(row.upper),
    votes: row.votes,
  }))
  return createHash('sha256').update(stableStringify({ method: input.method, votes: input.votes, rows })).digest('hex')
}
