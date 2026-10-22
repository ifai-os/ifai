import { getDb } from '@/lib/db/drizzle'

import { analysesFor, findDuplicates, flagsOf, hansOf, loadStoryAll, localeStatusOf, moreReportsOf, sourcesOf, textOf } from './load'
import { asVerification, hansHash, rewrittenLocales } from './rules'
import type { ReviewDetail } from './types'

/** Everything the review panel shows for one story, in every language. */
export async function loadReviewDetail(id: number, now = new Date()): Promise<ReviewDetail | null> {
  const { payload, db } = await getDb()
  const story = await loadStoryAll(payload, id)
  if (!story) return null
  const hans = hansOf(story)
  const [analyses, duplicates] = await Promise.all([
    analysesFor(db, [story.representativeItemId]),
    story.status === 'pending' || story.status === 'withdrawn' ? findDuplicates(db, payload, [story], now) : new Map(),
  ])
  const analysis = analyses.get(story.representativeItemId)
  const sources = sourcesOf(story)
  const original = sources.find((source) => source.role === 'original') ?? sources[0] ?? null
  const texts: ReviewDetail['texts'] = {}
  for (const locale of [...rewrittenLocales, 'zh-Hant'] as const) {
    const text = textOf(story, locale)
    if (text) texts[locale] = text
  }
  return {
    id: story.id,
    slug: story.slug,
    status: story.status,
    category: story.category,
    publishedAt: story.publishedAt ?? null,
    correctedAt: story.correctedAt ?? null,
    laterAt: story.laterAt ?? null,
    mergedInto: story.mergedInto ?? null,
    keptApartFrom: story.keptApartFrom ?? null,
    score: story.score ?? null,
    scoreA: analysis?.scoreA ?? null,
    scoreB: analysis?.scoreB ?? null,
    heat: story.heat ?? 0,
    flags: flagsOf(story),
    moreReports: moreReportsOf(story),
    original: original ? { name: original.name, url: original.url, publishedAt: original.publishedAt ?? null } : null,
    hans,
    sources,
    texts,
    localeStatus: localeStatusOf(story),
    hansHash: hansHash(hans),
    verification: asVerification(story.verification),
    duplicate: duplicates.get(story.id) ?? null,
  }
}
