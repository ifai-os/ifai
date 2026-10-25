import type { CollectionBeforeChangeHook } from 'payload'

import type { Story } from '@/payload-types'

/*
 * A story's publish time is the news source's, not the moment the editor approved it
 * (docs/specs/daily.md「发布时间」): an imported story keeps the time it came with, and the site
 * owner can change it. Pages show it and sort and group by it; when the story went on the site is
 * `approvedAt`, kept apart.
 */

type Times = Pick<Story, 'publishedAt' | 'sources'>

const timeOf = (value: string | null | undefined): number => (value ? Date.parse(value) : Number.NaN)

/**
 * The time the sources give, no later than `limit`: the original's, else the earliest of the
 * others. Null when none has one.
 */
export function sourceTime(sources: Times['sources'], limit: Date): string | null {
  // A missing or unreadable time is NaN, which no comparison lets through.
  const timed = (sources ?? []).filter((source) => timeOf(source.publishedAt) <= limit.getTime())
  const originals = timed.filter((source) => source.role === 'original')
  const pick = originals.length ? originals : timed
  if (!pick.length) return null
  return new Date(Math.min(...pick.map((source) => timeOf(source.publishedAt)))).toISOString()
}

/**
 * The publish time of a story going on the site at `approvedAt`: the one it has, else its
 * sources', else the approval itself. A time after the approval (a wrong time zone, a clock off)
 * counts as the approval.
 */
export function publishTime(story: Times, approvedAt: Date): string {
  const set = timeOf(story.publishedAt)
  if (!Number.isNaN(set)) return new Date(Math.min(set, approvedAt.getTime())).toISOString()
  return sourceTime(story.sources, approvedAt) ?? approvedAt.toISOString()
}

/**
 * A story going on the site, however that happens (the review screen, an import, the edit view):
 * the first time is kept in `approvedAt`, and the publish time filled in as `publishTime` says.
 */
export const stampPublishing: CollectionBeforeChangeHook<Story> = ({ data, originalDoc }) => {
  if (data.status !== 'published' || originalDoc?.status === 'published') return data
  const approvedAt = data.approvedAt ?? originalDoc?.approvedAt ?? new Date().toISOString()
  const publishedAt = publishTime(
    {
      publishedAt: data.publishedAt !== undefined ? data.publishedAt : originalDoc?.publishedAt,
      sources: data.sources ?? originalDoc?.sources,
    },
    new Date(approvedAt),
  )
  return { ...data, approvedAt, publishedAt }
}
