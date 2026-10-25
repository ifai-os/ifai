import type { VideoProvider } from '../rules'

/**
 * Video links in posts (docs/specs/circles.md rule 13): which site, the video's id there, its own
 * page, and the player that loads once the reader presses play. No server imports: the page can
 * use it too.
 */

/** A video on one of the three sites. `key` is its id there (Vimeo's private link hash after a slash). */
export type VideoLink = { provider: VideoProvider; key: string; url: string }

/** A b23.tv share link, Bilibili's short form: only the server can tell which video it is. */
export type ShortLink = { provider: 'bilibili'; short: string }

const youtubeId = /^[A-Za-z0-9_-]{11}$/
const bilibiliBv = /^BV[0-9A-Za-z]{10}$/
const bilibiliAv = /^av(\d{1,12})$/i
const vimeoId = /^\d{5,12}$/
const vimeoHash = /^[0-9a-f]{6,20}$/i
const b23Code = /^[0-9A-Za-z]{4,16}$/

const youtube = (id: string): VideoLink => ({ provider: 'youtube', key: id, url: `https://www.youtube.com/watch?v=${id}` })

function bilibili(value: string | null | undefined): VideoLink | null {
  if (!value) return null
  if (bilibiliBv.test(value)) return { provider: 'bilibili', key: value, url: `https://www.bilibili.com/video/${value}/` }
  const av = bilibiliAv.exec(value)
  return av ? { provider: 'bilibili', key: `av${av[1]}`, url: `https://www.bilibili.com/video/av${av[1]}/` } : null
}

function vimeo(id: string | undefined, hash?: string | null): VideoLink | null {
  if (!id || !vimeoId.test(id)) return null
  const key = hash && vimeoHash.test(hash) ? `${id}/${hash.toLowerCase()}` : id
  return { provider: 'vimeo', key, url: `https://vimeo.com/${key}` }
}

/**
 * What a pasted address points at: a YouTube video (watch, youtu.be, Shorts, live, embed), a
 * Bilibili one (BV or av ids, the player, b23.tv), a Vimeo one (with an unlisted video's hash);
 * null for anything else. Time stamps, playlists and tracking parameters are dropped.
 */
export function parseVideoLink(input: string): VideoLink | ShortLink | null {
  let url: URL
  try {
    url = new URL(input.trim())
  } catch {
    return null
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
  const host = url.hostname.toLowerCase().replace(/^(?:www|m|music|mobile)\./, '')
  const parts = url.pathname.split('/').filter(Boolean)

  switch (host) {
    case 'youtube.com':
    case 'youtube-nocookie.com': {
      const id = parts[0] === 'watch' ? url.searchParams.get('v') : ['shorts', 'live', 'embed', 'v'].includes(parts[0] ?? '') ? parts[1] : null
      return id && youtubeId.test(id) ? youtube(id) : null
    }
    case 'youtu.be':
      return parts[0] && youtubeId.test(parts[0]) ? youtube(parts[0]) : null
    case 'bilibili.com':
      return parts[0] === 'video' ? bilibili(parts[1]) : null
    case 'player.bilibili.com':
      return bilibili(url.searchParams.get('bvid')) ?? bilibili(url.searchParams.get('aid') && `av${url.searchParams.get('aid')}`)
    case 'b23.tv': {
      const code = parts[0]
      if (!code || parts.length > 1) return null
      return bilibili(code) ?? (b23Code.test(code) ? { provider: 'bilibili', short: code } : null)
    }
    case 'vimeo.com': {
      // vimeo.com/123456[/hash], or inside a channel, group, album or showcase: the id is the last number.
      if (vimeoId.test(parts[0] ?? '')) return vimeo(parts[0], parts[1])
      if (!['channels', 'groups', 'album', 'showcase'].includes(parts[0] ?? '')) return null
      return vimeo([...parts].reverse().find((part) => vimeoId.test(part)))
    }
    case 'player.vimeo.com':
      return parts[0] === 'video' ? vimeo(parts[1], url.searchParams.get('h')) : null
    default:
      return null
  }
}

/** The player, started at once: it is only put on the page when the reader presses play. */
export function embedUrl(provider: VideoProvider, key: string): string {
  if (provider === 'youtube') return `https://www.youtube-nocookie.com/embed/${key}?autoplay=1&rel=0&playsinline=1`
  if (provider === 'bilibili') {
    const id = key.startsWith('av') ? `aid=${key.slice(2)}` : `bvid=${key}`
    return `https://player.bilibili.com/player.html?${id}&autoplay=1&danmaku=0&high_quality=1`
  }
  const [id, hash] = key.split('/')
  return `https://player.vimeo.com/video/${id}?autoplay=1&dnt=1${hash ? `&h=${hash}` : ''}`
}

/** 12:48, or 1:02:03 for an hour and more. */
export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const rest = String(total % 60).padStart(2, '0')
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${rest}` : `${minutes}:${rest}`
}
