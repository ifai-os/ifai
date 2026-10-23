/**
 * The「今日海报」column's server side (docs/specs/daily.md「流程」11): a day's poster with the
 * day's published stories, the editor's order, generating (the five languages' content frozen,
 * every image rendered once to check), and following publishing: a story published later
 * joins an arranged poster while there is room, and a withdrawn story leaves the list and the
 * generated images at once.
 */
import type { PayloadRequest } from 'payload'

import { locales } from '@/i18n/config'
import { shanghaiDate } from '@/lib/shanghai-day'
import type { Poster, Story } from '@/payload-types'

import type { RawStory } from '../public/story-item'
import { ReviewError } from '../review/actions'
import { refreshDailyCache } from '../review/cache'
import { hansOf, type Payload, type StoryAll } from '../review/load'
import { addCheck, arrangementProblem, autoPick, candidateOf, dayBounds, posterState, type StoryFacts } from './rules'
import { entryOf, originalSource, posterVersion, readSnapshot, type PosterSnapshot } from './snapshot'
import type { DeskStory, PosterDesk } from './types'

export type PosterDeps = {
  now?: () => Date
  /** Renders every language once; defaults to the real images (fonts from Google Fonts). */
  render?: (snapshot: PosterSnapshot) => Promise<void>
  refresh?: () => Promise<void>
}

function deskStory(story: StoryAll): DeskStory {
  return {
    id: story.id,
    title: hansOf(story).title,
    category: story.category,
    source: originalSource(story),
    publishedAt: story.publishedAt ?? story.createdAt,
    correctedAt: story.correctedAt ?? null,
    heat: story.heat ?? 0,
  }
}

/** The stories published on a Shanghai calendar day, every language. */
async function dayStories(payload: Payload, date: string, req?: PayloadRequest): Promise<StoryAll[]> {
  const { start, end } = dayBounds(date)
  const { docs } = await payload.find({
    collection: 'stories',
    where: {
      and: [
        { status: { equals: 'published' } },
        { publishedAt: { greater_than_equal: start.toISOString() } },
        { publishedAt: { less_than: end.toISOString() } },
      ],
    },
    locale: 'all',
    depth: 0,
    pagination: false,
    limit: 500,
    req,
  })
  return docs as unknown as StoryAll[]
}

async function findPoster(payload: Payload, date: string, req?: PayloadRequest): Promise<Poster | null> {
  const { docs } = await payload.find({ collection: 'posters', where: { date: { equals: date } }, limit: 1, depth: 0, req })
  return docs[0] ?? null
}

function itemIds(poster: Pick<Poster, 'items'> | null): number[] {
  return (poster?.items ?? []).map((item) => (typeof item === 'number' ? item : item.id))
}

async function savePoster(payload: Payload, date: string, data: Partial<Omit<Poster, 'id' | 'date'>>, req?: PayloadRequest): Promise<void> {
  const existing = await findPoster(payload, date, req)
  if (existing) await payload.update({ collection: 'posters', id: existing.id, data, depth: 0, req })
  else await payload.create({ collection: 'posters', data: { date, status: 'draft', ...data }, depth: 0, req })
}

/** A day's poster as the column shows it: the list (automatic until the editor changes it), its state and the day's other stories. */
export async function loadPosterDesk(payload: Payload, date: string): Promise<PosterDesk> {
  const [stories, poster] = await Promise.all([dayStories(payload, date), findPoster(payload, date)])
  const byId = new Map(stories.map((story) => [story.id, story]))
  const candidates = new Map(stories.map((story) => [story.id, candidateOf(story)]))
  const arranged = Boolean(poster?.arranged)
  const items = arranged ? itemIds(poster).filter((id) => byId.has(id)) : autoPick([...candidates.values()])
  const snapshot = poster?.status === 'generated' ? readSnapshot(poster.snapshot) : null
  const shown = snapshot ? snapshot.entries.map((entry) => entry.id) : null
  return {
    date,
    state: posterState({
      items,
      shown,
      generatedAt: snapshot?.generatedAt ?? null,
      correctedAt: new Map(stories.map((story) => [story.id, story.correctedAt ?? null])),
    }),
    arranged,
    generatedAt: snapshot?.generatedAt ?? null,
    version: snapshot ? posterVersion(snapshot) : null,
    items: items.map((id) => ({ ...deskStory(byId.get(id)!), fresh: shown !== null && !shown.includes(id) })),
    others: stories
      .filter((story) => !items.includes(story.id))
      .sort((a, b) => (b.publishedAt ?? '').localeCompare(a.publishedAt ?? ''))
      .map((story) => ({ ...deskStory(story), check: addCheck(items, candidates.get(story.id)!, candidates) })),
  }
}

/** The editor's list: stories of that day, each once, eight at most, two per source at most. */
export async function arrangePoster(payload: Payload, date: string, items: number[]): Promise<PosterDesk> {
  const candidates = new Map((await dayStories(payload, date)).map((story) => [story.id, candidateOf(story)]))
  const problem = arrangementProblem(items, candidates)
  if (problem) throw new ReviewError('poster_invalid', 409, { problem })
  await savePoster(payload, date, { items, arranged: true })
  return loadPosterDesk(payload, date)
}

async function renderAll(snapshot: PosterSnapshot): Promise<void> {
  // Loaded here so the collection config (also read by the Payload CLI) does not pull in the image renderer.
  const { posterImage } = await import('./image')
  await Promise.all(
    locales.map(async (locale) => {
      const image = await posterImage(snapshot, locale)
      if (!(await image.arrayBuffer()).byteLength) throw new Error(`${locale}: empty image`)
    }),
  )
}

/**
 * 生成海报: freeze what the list shows in all five languages and render each image once, so a
 * missing font fails here and not for a reader. The page and images then show the new content.
 */
export async function generatePoster(payload: Payload, date: string, deps: PosterDeps = {}): Promise<PosterDesk> {
  const now = (deps.now?.() ?? new Date()).toISOString()
  const desk = await loadPosterDesk(payload, date)
  if (!desk.items.length) throw new ReviewError('poster_empty', 409)
  const ids = desk.items.map((item) => item.id)
  const { docs } = await payload.find({ collection: 'stories', where: { id: { in: ids } }, locale: 'all', depth: 0, pagination: false, limit: ids.length })
  const byId = new Map((docs as unknown as RawStory[]).map((doc) => [doc.id, doc]))
  const snapshot: PosterSnapshot = { date, generatedAt: now, updatedAt: now, entries: ids.map((id) => entryOf(byId.get(id)!)) }
  try {
    await (deps.render ?? renderAll)(snapshot)
  } catch (error) {
    throw new ReviewError('render_failed', 502, { message: error instanceof Error ? error.message : String(error) })
  }
  await savePoster(payload, date, { items: ids, arranged: true, status: 'generated', generatedAt: now, snapshot })
  await (deps.refresh ?? refreshDailyCache)()
  return loadPosterDesk(payload, date)
}

/**
 * A story was just published: it joins its day's poster when the editor has arranged it, there
 * is room, its source has fewer than two and its event is not on it yet. Until then the
 * automatic choice picks it up by heat. True when it joined.
 */
export async function joinPoster(payload: Payload, story: StoryFacts, req?: PayloadRequest): Promise<boolean> {
  if (!story.publishedAt) return false
  const date = shanghaiDate(new Date(story.publishedAt))
  const poster = await findPoster(payload, date, req)
  if (!poster?.arranged) return false
  const candidates = new Map((await dayStories(payload, date, req)).map((other) => [other.id, candidateOf(other)]))
  const candidate = candidateOf(story)
  candidates.set(story.id, candidate)
  const items = itemIds(poster).filter((id) => candidates.has(id))
  if (addCheck(items, candidate, candidates) !== 'ok') return false
  await payload.update({ collection: 'posters', id: poster.id, data: { items: [...items, story.id] }, depth: 0, req })
  return true
}

/**
 * A story left the site (withdrawn, unpublished or deleted): off its day's list, and off the
 * generated images at once rather than at the next generation. True when anything changed.
 */
export async function leavePoster(payload: Payload, story: Pick<Story, 'id' | 'publishedAt'>, req?: PayloadRequest, now = new Date()): Promise<boolean> {
  if (!story.publishedAt) return false
  const poster = await findPoster(payload, shanghaiDate(new Date(story.publishedAt)), req)
  if (!poster) return false
  const items = itemIds(poster)
  const snapshot = readSnapshot(poster.snapshot)
  const shown = Boolean(snapshot?.entries.some((entry) => entry.id === story.id))
  if (!items.includes(story.id) && !shown) return false
  const data: Partial<Poster> = { items: items.filter((id) => id !== story.id) }
  if (snapshot && shown) {
    const entries = snapshot.entries.filter((entry) => entry.id !== story.id)
    if (entries.length) data.snapshot = { ...snapshot, entries, updatedAt: now.toISOString() }
    else Object.assign(data, { snapshot: null, status: 'draft', generatedAt: null })
  }
  await payload.update({ collection: 'posters', id: poster.id, data, depth: 0, req })
  return true
}
