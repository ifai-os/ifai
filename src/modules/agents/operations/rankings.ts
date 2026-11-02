import { z } from 'zod'

import type { Locale } from '@/i18n/config'
import { getArenas, getBoard, getCountedVotes, type PublicArena } from '@/modules/rankings/data'
import { boardHref, regions, weightsKinds, type ArenaKind, type Region, type Weights } from '@/modules/rankings/rules'

import { count, facts, lines } from '../markdown'
import { defineOperation, notFound } from './types'
import { langParam, pageUrl } from './shared'

/**
 * 排行 (docs/specs/rankings.md) for agents: IFAI's own blind-test arenas, where readers vote on
 * two anonymous answers and a weekly snapshot ranks the models (Bradley–Terry, 95% intervals).
 * The outside boards on the rankings pages keep their sources' terms and are only linked.
 */

const arenaUrl = (origin: string, locale: Locale, arena: PublicArena, first: boolean) => pageUrl(origin, locale, boardHref(first ? null : arena.slug))

export type ArenaItem = {
  slug: string
  url: string
  name: string
  intro: string | null
  kind: ArenaKind
  /** The latest week's leaders, best first. */
  leaders: { rank: number; name: string; org: string; score: number }[]
}

export type RankingRow = {
  /** Null while provisional (too few votes to place). */
  rank: number | null
  provisional: boolean
  name: string
  org: string
  weights: Weights
  region: Region
  license: string | null
  score: number
  /** The 95% interval of the score. */
  lower: number
  upper: number
  votes: number
  /** Average cost of an answer in this arena, US dollars. */
  costUsd: number | null
}

export type RankingsView =
  | { arenas: ArenaItem[]; arena?: never }
  | {
      arenas?: never
      arena: Omit<ArenaItem, 'leaders'>
      /** The Monday of the latest snapshot's week; null before the first. */
      week: string | null
      computedAt: string | null
      votes: number
      rows: RankingRow[]
      newcomers: string[]
    }

const leadersShown = 3

export const modelRankings = defineOperation({
  name: 'rankings.read',
  tool: 'model_rankings',
  title: 'Model rankings',
  description:
    'IFAI’s blind-test model rankings: readers compare two anonymous answers to the same prompt and vote; a weekly snapshot ranks the models with a 95% interval. ' +
    'Without `arena`: every arena with its top three. With `arena` (a slug): that arena’s full table, optionally only open- or closed-weights models or one region.',
  module: 'rankings',
  path: '/rankings',
  input: z.object({
    lang: langParam,
    arena: z.string().regex(/^[a-z0-9][a-z0-9-]{0,99}$/).optional().describe('An arena’s slug; leave out for the list of arenas.'),
    weights: z.enum(weightsKinds).optional().describe('open or closed: only models with open or closed weights.'),
    region: z.enum(regions).optional().describe('us, cn, eu or other: only models from there.'),
  }),
  async run({ lang, arena: slug, weights, region }, { origin }): Promise<RankingsView> {
    const arenas = await getArenas(lang)
    if (!slug) {
      const boards = await Promise.all(arenas.map((arena) => getBoard(arena.id, lang)))
      return {
        arenas: arenas.map((arena, index) => ({
          slug: arena.slug,
          url: arenaUrl(origin, lang, arena, index === 0),
          name: arena.name,
          intro: arena.intro,
          kind: arena.kind,
          leaders: boards[index].rows
            .filter((row) => row.rank !== null)
            .slice(0, leadersShown)
            .map((row) => ({ rank: row.rank as number, name: row.name, org: row.org, score: row.score })),
        })),
      }
    }
    const index = arenas.findIndex((arena) => arena.slug === slug)
    if (index < 0) throw notFound(`There is no arena "${slug}". Call model_rankings without \`arena\` for the list.`)
    const arena = arenas[index]
    const [board, votes] = await Promise.all([getBoard(arena.id, lang), getCountedVotes(arena.id)])
    return {
      arena: { slug: arena.slug, url: arenaUrl(origin, lang, arena, index === 0), name: arena.name, intro: arena.intro, kind: arena.kind },
      week: board.week,
      computedAt: board.computedAt,
      votes,
      rows: board.rows
        .filter((row) => (!weights || row.weights === weights) && (!region || row.region === region))
        .map((row) => ({
          rank: row.rank,
          provisional: row.provisional,
          name: row.name,
          org: row.org,
          weights: row.weights,
          region: row.region,
          license: row.license,
          score: Math.round(row.score),
          lower: Math.round(row.lower),
          upper: Math.round(row.upper),
          votes: row.votes,
          costUsd: row.costUsd,
        })),
      newcomers: board.newcomers.map((newcomer) => newcomer.name),
    }
  },
  markdown(view) {
    if (view.arenas) {
      if (!view.arenas.length) return 'No arenas are published yet.'
      return lines(
        `${count(view.arenas.length, 'arena')}. Call again with \`arena\` for a full table.`,
        ...view.arenas.map((arena) =>
          lines(
            '',
            `## ${arena.name} · slug \`${arena.slug}\` · ${arena.kind}`,
            arena.intro,
            arena.leaders.length ? arena.leaders.map((leader) => `${leader.rank}. ${leader.name} (${leader.org}) · ${Math.round(leader.score)}`).join('\n') : 'No ranking yet.',
            arena.url,
          ),
        ),
      )
    }
    const { arena, week, votes, rows, newcomers } = view
    return lines(
      `# ${arena.name}`,
      arena.intro,
      facts(week ? `week of ${week}` : 'no weekly ranking yet', count(votes, 'counted vote'), arena.url),
      newcomers.length ? `New this week: ${newcomers.join(', ')}` : null,
      rows.length
        ? [
            '',
            '| Rank | Model | Maker | Weights | Score (95% interval) | Votes |',
            '| --- | --- | --- | --- | --- | --- |',
            ...rows.map(
              (row) =>
                `| ${row.rank ?? 'provisional'} | ${row.name.replace(/\|/g, '/')} | ${row.org.replace(/\|/g, '/')} | ${row.weights} | ${row.score} (${row.lower}–${row.upper}) | ${row.votes} |`,
            ),
          ].join('\n')
        : '\nNo models match.',
    )
  },
})

export const rankingOperations = [modelRankings]
