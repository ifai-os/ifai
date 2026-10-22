/**
 * How heat is scored (docs/specs/apps.md「热度」). Heat is out of 100: the website's Tranco rank
 * gives up to 50, opening the website from IFAI and saving the app up to 30, daily-news
 * mentions up to 20. Each part is rounded to a whole number before they are added, so the
 * parts a page shows always add up to the heat it shows. Revisit these numbers once there is
 * a real distribution to look at.
 */

export const heatWeights = { rank: 50, engagement: 30, mentions: 20 } as const

/** Tranco ranks a million sites: rank 1 scores the full 50, the millionth 0, on a log scale. */
export const trancoListSize = 1_000_000

/**
 * Clicks and mentions are scored by where an app falls among the apps that have any. While
 * fewer than this many apps have some, the share is taken of this many, so the first few
 * clicks on a quiet day cannot earn the full score.
 */
export const minimumSample = 10

/** The rising board only takes apps with at least this much heat, so a small base cannot jump to the top. */
export const risingMinimumHeat = 30

/** Clicks and saves count over the 7 days before the day; mentions over 30; change compares with 7 days earlier. */
export const engagementDays = 7
export const mentionDays = 30
export const changeDays = 7

/** 0–50 from a Tranco rank; null (not in the list) scores 0. */
export function rankScore(rank: number | null): number {
  if (!rank || rank < 1) return 0
  const share = 1 - Math.log10(Math.min(rank, trancoListSize)) / Math.log10(trancoListSize)
  return Math.round(heatWeights.rank * share)
}

/**
 * Counts → 0–max: the share of apps with a positive count whose count is at or below this one
 * (at least `minimumSample` apps are assumed). Zero scores 0; the busiest app scores max.
 */
export function percentileScores(counts: readonly number[], max: number): number[] {
  const positive = counts.filter((count) => count > 0).sort((a, b) => a - b)
  const sample = Math.max(positive.length, minimumSample)
  return counts.map((count) => {
    if (count <= 0) return 0
    // Binary search: how many positive counts are <= count.
    let low = 0
    let high = positive.length
    while (low < high) {
      const middle = (low + high) >>> 1
      if (positive[middle] <= count) low = middle + 1
      else high = middle
    }
    return Math.round((max * low) / sample)
  })
}

export type HeatInput = {
  appId: number
  /** For ties, so equal heat always lists in the same order. */
  name: string
  categoryId: number | null
  trancoRank: number | null
  clicks: number
  saves: number
  mentions: number
  /** Heat `changeDays` earlier; null when the app had no heat then (new, or not published yet). */
  heatBefore: number | null
}

export type HeatResult = {
  appId: number
  rankScore: number
  engagementScore: number
  mentionScore: number
  heat: number
  change7d: number | null
  rankOverall: number
  rankCategory: number | null
  rankRising: number | null
}

/**
 * Heat, change and board places for every published app on one day. Boards: overall (heat),
 * each primary category (heat), rising (7-day change, only apps with at least
 * `risingMinimumHeat` that went up). Ties go to the better Tranco rank, then more clicks and
 * saves, then the name.
 */
export function scoreApps(inputs: readonly HeatInput[]): HeatResult[] {
  const engagement = percentileScores(
    inputs.map((input) => input.clicks + input.saves),
    heatWeights.engagement,
  )
  const mentions = percentileScores(
    inputs.map((input) => input.mentions),
    heatWeights.mentions,
  )

  const scored = inputs.map((input, index) => {
    const parts = { rankScore: rankScore(input.trancoRank), engagementScore: engagement[index], mentionScore: mentions[index] }
    const heat = parts.rankScore + parts.engagementScore + parts.mentionScore
    return { input, ...parts, heat, change7d: input.heatBefore === null ? null : heat - input.heatBefore }
  })
  type Scored = (typeof scored)[number]

  const tieBreak = (a: Scored, b: Scored) =>
    (a.input.trancoRank ?? Infinity) - (b.input.trancoRank ?? Infinity) ||
    b.input.clicks + b.input.saves - (a.input.clicks + a.input.saves) ||
    a.input.name.localeCompare(b.input.name, 'en') ||
    a.input.appId - b.input.appId
  const byHeat = [...scored].sort((a, b) => b.heat - a.heat || tieBreak(a, b))

  const overall = new Map(byHeat.map((app, index) => [app.input.appId, index + 1]))
  const category = new Map<number, number>()
  const perCategory = new Map<number, number>()
  for (const app of byHeat) {
    const categoryId = app.input.categoryId
    if (categoryId === null) continue
    const place = (perCategory.get(categoryId) ?? 0) + 1
    perCategory.set(categoryId, place)
    category.set(app.input.appId, place)
  }
  const rising = new Map(
    byHeat
      .filter((app) => app.heat >= risingMinimumHeat && app.change7d !== null && app.change7d > 0)
      .sort((a, b) => (b.change7d ?? 0) - (a.change7d ?? 0) || b.heat - a.heat || tieBreak(a, b))
      .map((app, index) => [app.input.appId, index + 1]),
  )

  return scored.map((app) => ({
    appId: app.input.appId,
    rankScore: app.rankScore,
    engagementScore: app.engagementScore,
    mentionScore: app.mentionScore,
    heat: app.heat,
    change7d: app.change7d,
    rankOverall: overall.get(app.input.appId) ?? 0,
    rankCategory: category.get(app.input.appId) ?? null,
    rankRising: rising.get(app.input.appId) ?? null,
  }))
}
