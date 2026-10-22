import type { MentionBasis } from '../schema'
import { isOnSite } from './domains'

/**
 * Which published daily stories are about which apps (docs/specs/apps.md「数据」, 日报提及). A
 * story counts for an app when one of the products or companies the daily pipeline extracted
 * from its report is the app's name or an alias, or when one of its sources is on the app's
 * website. Wrong matches are removed by hand in the back office.
 */

export type MentionTarget = {
  id: number
  name: string
  aliases: readonly string[]
  developer: string | null
  domain: string | null
  website: string | null
}

export type MentionStory = {
  id: number
  eventId: number | null
  publishedAt: string
  /** Products and companies from the story's report, as the analysis named them. */
  names: readonly string[]
  /** The story's sources and its report's address. */
  urls: readonly string[]
}

export type Mention = {
  appId: number
  storyId: number
  eventId: number | null
  basis: MentionBasis
  matched: string
  publishedAt: string
}

const cjk = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u

/** "Character.AI" and "character ai", "GPT‑4o" and "gpt 4o" compare equal. */
export function normalizeName(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[.\-_/·•:|,()（）]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Whether an extracted product or company names the app: exactly; or the app's name followed by
 * more words ("Claude Opus 4.5" → Claude, "Notion AI" → Notion; names of three characters or
 * more); or the maker's name in front ("Google Gemini"). Chinese, Japanese and Korean names
 * match anywhere in the product's name. Both sides are already normalized.
 */
export function namesApp(candidate: string, term: string, developer: string | null): boolean {
  if (term.length < 2 || !candidate) return false
  if (candidate === term) return true
  if (cjk.test(term)) return candidate.includes(term)
  if (term.length >= 3 && candidate.startsWith(`${term} `)) return true
  if (developer && developer !== term) {
    const withMaker = `${developer} ${term}`
    return candidate === withMaker || candidate.startsWith(`${withMaker} `)
  }
  return false
}

type PreparedTarget = { target: MentionTarget; name: string; aliases: string[]; developer: string | null }

function prepare(targets: readonly MentionTarget[]): PreparedTarget[] {
  return targets.map((target) => ({
    target,
    name: normalizeName(target.name),
    aliases: target.aliases.map(normalizeName).filter((alias) => alias.length >= 2),
    developer: target.developer ? normalizeName(target.developer) : null,
  }))
}

function matchOne(story: MentionStory, names: string[], app: PreparedTarget): Pick<Mention, 'basis' | 'matched'> | null {
  for (const [index, candidate] of names.entries()) {
    if (namesApp(candidate, app.name, app.developer)) return { basis: 'name', matched: story.names[index] }
  }
  for (const [index, candidate] of names.entries()) {
    if (app.aliases.some((alias) => namesApp(candidate, alias, app.developer))) {
      return { basis: 'alias', matched: story.names[index] }
    }
  }
  const url = story.urls.find((address) => isOnSite(address, app.target))
  return url ? { basis: 'domain', matched: url } : null
}

/** Every (app, story) pair that matches, with the strongest reason: name, then alias, then the website. */
export function matchMentions(stories: readonly MentionStory[], targets: readonly MentionTarget[]): Mention[] {
  const apps = prepare(targets)
  const mentions: Mention[] = []
  for (const story of stories) {
    const names = story.names.map(normalizeName)
    for (const app of apps) {
      const match = matchOne(story, names, app)
      if (!match) continue
      mentions.push({
        appId: app.target.id,
        storyId: story.id,
        eventId: story.eventId,
        publishedAt: story.publishedAt,
        ...match,
      })
    }
  }
  return mentions
}
