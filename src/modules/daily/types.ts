import { z } from 'zod'

/**
 * A link found by a reader (docs/specs/daily.md「信源」), before it is checked against the
 * database. Readers are pure: they turn fetched text into FoundItems and never fetch.
 */
export type FoundItem = {
  /** Normalized with normalizeUrl(); the unique key of raw_items. */
  url: string
  title: string
  /** The source's own summary or excerpt as plain text, if it gives one. */
  summary?: string
  /** When the source says the item was published. Missing when the source gives no date. */
  publishedAt?: Date
  /** The source's own id (RSS guid, Hacker News objectID). */
  externalId?: string
  /** Where readers are discussing it (Hacker News thread). Counts as a source, not the original. */
  discussionUrl?: string
  /** Popularity evidence for hot_signal sources. */
  signals?: { points?: number; comments?: number }
}

/** Source tiers and uses, as in the spec (after AIHOT). */
export const sourceTiers = ['T1', 'T1_5', 'T2'] as const
export const sourceUses = ['editorial', 'roundup', 'hot_signal'] as const
export type SourceTier = (typeof sourceTiers)[number]
export type SourceUse = (typeof sourceUses)[number]

/**
 * Settings for the web-list reader, stored on the source in Payload and validated with this
 * schema. Selectors are CSS; the ones marked "relative" are searched inside each entry.
 */
export const htmlListConfigSchema = z.object({
  /** One list entry. */
  item: z.string().min(1),
  /** The entry's link (relative). Defaults to the entry itself when it is an <a>, else its first link. */
  link: z.string().min(1).optional(),
  /** The title text (relative). Defaults to the link text. */
  title: z.string().min(1).optional(),
  /** A summary (relative). */
  summary: z.string().min(1).optional(),
  /** The date (relative). Read from `dateAttr`, else the datetime attribute, else the text. */
  date: z.string().min(1).optional(),
  dateAttr: z.string().min(1).optional(),
  /** For lists grouped by day (Future Tools): the group element, and its date (relative to the group). */
  group: z.string().min(1).optional(),
  groupDate: z.string().min(1).optional(),
  /** Entries linking to these hosts are skipped (the site's own category pages, for example). */
  skipHosts: z.array(z.string().min(1)).optional(),
})

export type HtmlListConfig = z.infer<typeof htmlListConfigSchema>
