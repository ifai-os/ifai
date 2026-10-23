/** Shapes the poster endpoints return and the review screen's「今日海报」column renders (types only). */
import type { StoryCategory } from '../categories'
import type { AddCheck, PosterState } from './rules'

/** A published story of the poster's day, as the editor sees it (simplified Chinese). */
export type DeskStory = {
  id: number
  title: string
  category: StoryCategory
  /** Publisher of the original announcement: what "the same source" counts. */
  source: string | null
  publishedAt: string
  correctedAt: string | null
  heat: number
}

export type PosterDesk = {
  /** The Shanghai calendar day, YYYY-MM-DD. */
  date: string
  state: PosterState
  /** False while the list follows the automatic choice (nothing changed or generated yet). */
  arranged: boolean
  generatedAt: string | null
  /** Changes when the images change; image links carry it so browsers fetch the new ones. */
  version: string | null
  /** On the poster, in order; `fresh` when it is not in the generated images yet. */
  items: (DeskStory & { fresh: boolean })[]
  /** The day's other published stories, newest first, with whether the editor can add each. */
  others: (DeskStory & { check: AddCheck })[]
}
