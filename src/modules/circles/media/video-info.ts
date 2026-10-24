import { cleanLine } from '@/modules/apps/reviews/rules'
import { userAgent } from '@/modules/daily/collect/fetch'

import { parseVideoLink, type ShortLink, type VideoLink } from './links'

/**
 * What a video's site says about it (docs/specs/circles.md rule 13): YouTube's oEmbed, or its
 * Data API when YOUTUBE_API_KEY is set (the only way to get a duration), Bilibili's public video
 * API, Vimeo's oEmbed. Only these fixed addresses are asked; the covers they name are downloaded
 * through the checked fetch in ./images.ts. Titles and names are shown as text, never followed.
 */

export type VideoInfo = {
  title: string
  channel: string | null
  /** Seconds. */
  duration: number | null
  /** Cover addresses to try, best first. */
  covers: string[]
}

export type VideoInfoDeps = {
  fetch?: typeof fetch
  /** YouTube Data API key; read from YOUTUBE_API_KEY when left out. */
  youtubeKey?: string
}

const timeoutMs = 8_000
const maxTitle = 300

async function getJson(url: string, deps: VideoInfoDeps): Promise<{ status: number; data: unknown }> {
  const response = await (deps.fetch ?? fetch)(url, {
    headers: { 'user-agent': userAgent(), accept: 'application/json' },
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!response.ok) {
    await response.body?.cancel()
    return { status: response.status, data: null }
  }
  return { status: response.status, data: await response.json().catch(() => null) }
}

const text = (value: unknown, max = maxTitle): string | null => {
  const line = typeof value === 'string' ? cleanLine(value) : ''
  return line ? [...line].slice(0, max).join('') : null
}

const seconds = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.round(value) : null

/** PT1H2M3S → 3723. Live streams say P0D: no duration. */
export function isoDuration(value: unknown): number | null {
  const match = typeof value === 'string' ? /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(value) : null
  if (!match) return null
  const [, days, hours, minutes, secs] = match.map((part) => Number(part ?? 0))
  return seconds(days * 86400 + hours * 3600 + minutes * 60 + secs)
}

const field = (value: unknown, key: string): unknown =>
  value && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined

async function youtube(link: VideoLink, deps: VideoInfoDeps): Promise<VideoInfo | null> {
  const covers = ['maxresdefault', 'hqdefault'].map((name) => `https://i.ytimg.com/vi/${link.key}/${name}.jpg`)
  const key = deps.youtubeKey ?? process.env.YOUTUBE_API_KEY
  if (key) {
    const query = new URLSearchParams({ part: 'snippet,contentDetails', id: link.key, key })
    const { status, data } = await getJson(`https://www.googleapis.com/youtube/v3/videos?${query}`, deps)
    // A key that stopped working (quota, revoked) falls back to oEmbed.
    if (status === 200) {
      const item = (field(data, 'items') as unknown[] | undefined)?.[0]
      const snippet = field(item, 'snippet')
      const title = text(field(snippet, 'title'))
      if (!title) return null
      const thumbnails = field(snippet, 'thumbnails')
      const best = ['maxres', 'standard', 'high', 'medium']
        .map((size) => field(field(thumbnails, size), 'url'))
        .filter((url): url is string => typeof url === 'string')
      return {
        title,
        channel: text(field(snippet, 'channelTitle')),
        duration: isoDuration(field(field(item, 'contentDetails'), 'duration')),
        covers: [...new Set([...best.slice(0, 1), ...covers])],
      }
    }
  }
  const { data } = await getJson(`https://www.youtube.com/oembed?${new URLSearchParams({ format: 'json', url: link.url })}`, deps)
  const title = text(field(data, 'title'))
  return title ? { title, channel: text(field(data, 'author_name')), duration: null, covers } : null
}

async function bilibili(link: VideoLink, deps: VideoInfoDeps): Promise<VideoInfo | null> {
  const query = link.key.startsWith('av') ? `aid=${link.key.slice(2)}` : `bvid=${link.key}`
  const { data } = await getJson(`https://api.bilibili.com/x/web-interface/view?${query}`, deps)
  // Bilibili answers 200 with its own code: 0 is found; -404, 62002 (hidden) and the rest are not.
  if (field(data, 'code') !== 0) return null
  const video = field(data, 'data')
  const title = text(field(video, 'title'))
  if (!title) return null
  const pic = field(video, 'pic')
  return {
    title,
    channel: text(field(field(video, 'owner'), 'name')),
    duration: seconds(field(video, 'duration')),
    covers: typeof pic === 'string' && pic ? [pic.replace(/^http:\/\//, 'https://')] : [],
  }
}

async function vimeo(link: VideoLink, deps: VideoInfoDeps): Promise<VideoInfo | null> {
  const { data } = await getJson(`https://vimeo.com/api/oembed.json?${new URLSearchParams({ url: link.url, width: '1280' })}`, deps)
  const title = text(field(data, 'title'))
  if (!title) return null
  const cover = field(data, 'thumbnail_url')
  return {
    title,
    channel: text(field(data, 'author_name')),
    duration: seconds(field(data, 'duration')),
    covers: typeof cover === 'string' && cover ? [cover] : [],
  }
}

/** The video's facts, or null when its site does not have them: gone, private, or not answering. */
export async function readVideoInfo(link: VideoLink, deps: VideoInfoDeps = {}): Promise<VideoInfo | null> {
  try {
    if (link.provider === 'youtube') return await youtube(link, deps)
    if (link.provider === 'bilibili') return await bilibili(link, deps)
    return await vimeo(link, deps)
  } catch {
    return null
  }
}

/** Where a b23.tv link goes, read from its redirect without opening the page; null when that is not a Bilibili video. */
export async function followShortLink(link: ShortLink, deps: VideoInfoDeps = {}): Promise<VideoLink | null> {
  try {
    const response = await (deps.fetch ?? fetch)(`https://b23.tv/${link.short}`, {
      headers: { 'user-agent': userAgent() },
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
    })
    await response.body?.cancel()
    const location = response.headers.get('location')
    const target = location ? parseVideoLink(new URL(location, 'https://b23.tv').toString()) : null
    return target && 'key' in target && target.provider === 'bilibili' ? target : null
  } catch {
    return null
  }
}
