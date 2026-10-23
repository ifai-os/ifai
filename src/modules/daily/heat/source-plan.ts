/**
 * Which later reports join which story's source list (docs/specs/daily.md「流程」6): a report
 * judged the same happening as another goes to the story of that report, and a Hacker News
 * thread about a report goes there as a discussion. Each address is offered to a story once,
 * so a source the editor removed stays removed. Pure; ./sources.ts loads and saves.
 */
import type { Story } from '@/payload-types'

import type { EventRelation } from '../schema'

export type SourceEntry = Omit<NonNullable<Story['sources']>[number], 'id'>

export type MemberReport = {
  itemId: number
  relation: EventRelation
  /** For "same": the report it was judged the same happening as. */
  matchedItemId: number | null
  sourceName: string
  url: string
  publishedAt: Date | null
}

export type ThreadLink = { itemId: number; sourceName: string; url: string }

export type StoryRef = {
  id: number
  representativeItemId: number
  createdAt: Date
  /** Addresses already offered to this story's source list; null before the first check. */
  seen: string[] | null
  sources: SourceEntry[]
}

/** `sources` is null when the list stays as it is; `seen` is what the story remembers next. */
export type SourcePlan = { storyId: number; sources: SourceEntry[] | null; seen: string[] }

/** The story a report belongs to: follow its "same as" links back to a story's own report, else the event's main story. */
export function storyFor(
  itemId: number,
  members: ReadonlyMap<number, MemberReport>,
  byReport: ReadonlyMap<number, StoryRef>,
  fallback: StoryRef | null,
): StoryRef | null {
  let current: number | null = itemId
  for (let depth = 0; current !== null && depth < 8; depth++) {
    const story = byReport.get(current)
    if (story) return story
    const member = members.get(current)
    current = member?.relation === 'same' ? member.matchedItemId : null
  }
  return fallback
}

/** The source list with new reports added before the discussion threads and new threads at the end; null when nothing is new. */
export function withNewSources(current: readonly SourceEntry[], reports: readonly SourceEntry[], threads: readonly SourceEntry[]): SourceEntry[] | null {
  const urls = new Set(current.map((source) => source.url))
  const fresh = (list: readonly SourceEntry[]) =>
    list.filter((source) => {
      if (urls.has(source.url)) return false
      urls.add(source.url)
      return true
    })
  const addedReports = fresh(reports)
  const addedThreads = fresh(threads)
  if (!addedReports.length && !addedThreads.length) return null
  const firstThread = current.findIndex((source) => source.role === 'discussion')
  const before = firstThread < 0 ? current : current.slice(0, firstThread)
  const after = firstThread < 0 ? [] : current.slice(firstThread)
  return [...before, ...addedReports, ...after, ...addedThreads]
}

/**
 * For each story of one event: the reports and threads it has not been offered yet (on the
 * first check, every one; those already listed are skipped by address), and the addresses it
 * has now been offered. Roundups only count towards heat and never become sources.
 */
export function planSources({
  members,
  threads,
  stories,
  eventReportId,
}: {
  members: readonly MemberReport[]
  threads: readonly ThreadLink[]
  stories: readonly StoryRef[]
  /** The report that started the event; its story takes reports that cannot be placed otherwise. */
  eventReportId: number | null
}): SourcePlan[] {
  if (!stories.length) return []
  const byReport = new Map(stories.map((story) => [story.representativeItemId, story]))
  const main =
    (eventReportId !== null ? byReport.get(eventReportId) : undefined) ??
    [...stories].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0] ??
    null
  const memberMap = new Map(members.map((member) => [member.itemId, member]))

  const reports = new Map<number, SourceEntry[]>()
  const links = new Map<number, SourceEntry[]>()
  const add = (list: Map<number, SourceEntry[]>, story: StoryRef, entry: SourceEntry) => list.set(story.id, [...(list.get(story.id) ?? []), entry])

  for (const member of members) {
    if (member.relation !== 'same' || byReport.has(member.itemId)) continue
    const story = storyFor(member.itemId, memberMap, byReport, main)
    if (!story) continue
    add(reports, story, {
      name: member.sourceName,
      role: 'report',
      url: member.url,
      publishedAt: member.publishedAt?.toISOString() ?? null,
    })
  }
  for (const thread of threads) {
    if (memberMap.get(thread.itemId)?.relation === 'roundup') continue
    const story = storyFor(thread.itemId, memberMap, byReport, main)
    if (!story) continue
    add(links, story, { name: thread.sourceName, role: 'discussion', url: thread.url, publishedAt: null })
  }

  const plans: SourcePlan[] = []
  for (const story of stories) {
    const seen = new Set(story.seen ?? [])
    const unseen = (list: readonly SourceEntry[]) => list.filter((entry) => !seen.has(entry.url))
    const offered = [...(reports.get(story.id) ?? []), ...(links.get(story.id) ?? [])].map((entry) => entry.url)
    const sources = withNewSources(story.sources, unseen(reports.get(story.id) ?? []), unseen(links.get(story.id) ?? []))
    const next = [...new Set([...(story.seen ?? []), ...offered])]
    // Save when the list grows, on the first check, or when there is something new to remember.
    if (sources || story.seen === null || next.length !== seen.size) plans.push({ storyId: story.id, sources, seen: next })
  }
  return plans
}
