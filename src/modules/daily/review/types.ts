/** Shapes the review endpoints return and the admin screen renders (types only; no server code). */
import type { StoryCategory } from '../categories'
import type { SourceRole, StoryStatus } from '../story-fields'
import type { AnalysisFlag } from '../judge/rules'
import type { LocaleStatus, RewrittenLocale, Verification } from './rules'

export type StorySourceInput = {
  name: string
  role: SourceRole
  url: string
  publishedAt?: string | null
}

/** What the editor can change on a story (simplified Chinese, category, sources). */
export type Edits = {
  title: string
  summary: string
  tryIt: string
  category: StoryCategory
  sources: StorySourceInput[]
}

export type DuplicateCandidate = {
  id: number
  title: string
  publishedAt: string | null
  /** Cosine similarity of the two reports, or null when they share an event. */
  similarity: number | null
  /** Why it is a candidate: a published story of the same event, or a similar report. */
  reason: 'same_event' | 'similar'
}

export type QueueItem = {
  id: number
  title: string
  category: StoryCategory
  status: StoryStatus
  score: number | null
  scoreA: number | null
  scoreB: number | null
  heat: number
  sourceName: string
  originalPublishedAt: string | null
  moreReports: number
  failedLocales: RewrittenLocale[]
  unverified: number
  duplicate: DuplicateCandidate | null
  flags: AnalysisFlag[]
  laterAt: string | null
  createdAt: string
}

export type PublishedItem = {
  id: number
  title: string
  category: StoryCategory
  publishedAt: string | null
  correctedAt: string | null
}

export type SourceHealth = { id: number; name: string; error: string }

export type ReviewSummary = {
  pending: number
  attention: number
  publishedToday: number
  lastPublishedAt: string | null
  sources: { total: number; failing: SourceHealth[] }
  usage: { costUsd: number; calls: number; budgetUsd: number }
  switches: { collect: boolean; modelCalls: boolean }
  /** Since 00:00 Shanghai time: links found, events made, reports that passed the score threshold. */
  intake: { items: number; events: number; queued: number }
}

export type ReviewQueue = {
  items: QueueItem[]
  published: PublishedItem[]
  summary: ReviewSummary
  loadedAt: string
}

export type LocaleText = { title: string; summary: string; tryIt: string }

export type ReviewDetail = {
  id: number
  slug: string
  status: StoryStatus
  category: StoryCategory
  publishedAt: string | null
  correctedAt: string | null
  laterAt: string | null
  mergedInto: number | null
  /** The published story the editor said this one is not a duplicate of. */
  keptApartFrom: number | null
  score: number | null
  scoreA: number | null
  scoreB: number | null
  heat: number
  flags: AnalysisFlag[]
  moreReports: number
  original: { name: string; url: string; publishedAt: string | null } | null
  hans: LocaleText
  sources: StorySourceInput[]
  texts: Partial<Record<RewrittenLocale | 'zh-Hant', LocaleText>>
  localeStatus: LocaleStatus
  hansHash: string
  verification: Verification | null
  duplicate: DuplicateCandidate | null
}

export type RewriteResult = {
  written: RewrittenLocale[]
  failed: { locale: RewrittenLocale; error: string }[]
}

export type MergeResult = {
  target: { id: number; title: string; moreReports: number }
}

export type AssistKind = 'shorten' | 'title'
