import sharp from 'sharp'
import { describe, expect, it } from 'vitest'

import { inspectImage } from '@/modules/circles/media/images'
import { embedUrl, formatDuration, parseVideoLink, type VideoLink } from '@/modules/circles/media/links'
import { fitWithin, uploadPlan } from '@/modules/circles/media/prepare'
import { followShortLink, isoDuration, readVideoInfo } from '@/modules/circles/media/video-info'
import { mediaRules } from '@/modules/circles/rules'

describe('circles: video links', () => {
  it('reads YouTube addresses, dropping time stamps and playlists', () => {
    const video = { provider: 'youtube', key: 'dQw4w9WgXcQ', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' }
    for (const input of [
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s&list=PL123',
      'https://m.youtube.com/watch?v=dQw4w9WgXcQ',
      '  https://music.youtube.com/watch?v=dQw4w9WgXcQ  ',
      'https://youtu.be/dQw4w9WgXcQ?si=abc',
      'https://www.youtube.com/shorts/dQw4w9WgXcQ',
      'https://www.youtube.com/live/dQw4w9WgXcQ',
      'https://www.youtube.com/embed/dQw4w9WgXcQ',
      'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
    ]) {
      expect(parseVideoLink(input), input).toEqual(video)
    }
    expect(parseVideoLink('https://www.youtube.com/watch?v=short')).toBeNull()
    expect(parseVideoLink('https://www.youtube.com/@channel')).toBeNull()
    expect(parseVideoLink('https://www.youtube.com/playlist?list=PL123')).toBeNull()
  })

  it('reads Bilibili addresses: BV and av ids, the player, b23.tv', () => {
    expect(parseVideoLink('https://www.bilibili.com/video/BV1GJ411x7h7/?spm_id_from=333.999')).toEqual({
      provider: 'bilibili',
      key: 'BV1GJ411x7h7',
      url: 'https://www.bilibili.com/video/BV1GJ411x7h7/',
    })
    expect(parseVideoLink('https://m.bilibili.com/video/av170001')).toEqual({ provider: 'bilibili', key: 'av170001', url: 'https://www.bilibili.com/video/av170001/' })
    expect(parseVideoLink('https://player.bilibili.com/player.html?bvid=BV1GJ411x7h7&page=1')).toMatchObject({ key: 'BV1GJ411x7h7' })
    expect(parseVideoLink('https://player.bilibili.com/player.html?aid=170001')).toMatchObject({ key: 'av170001' })
    expect(parseVideoLink('https://b23.tv/BV1GJ411x7h7')).toMatchObject({ key: 'BV1GJ411x7h7' })
    // Only the server can tell where a short link goes.
    expect(parseVideoLink('https://b23.tv/aBc1234')).toEqual({ provider: 'bilibili', short: 'aBc1234' })
    expect(parseVideoLink('https://www.bilibili.com/bangumi/play/ep1234')).toBeNull()
    expect(parseVideoLink('https://space.bilibili.com/123')).toBeNull()
  })

  it("reads Vimeo addresses, keeping an unlisted video's hash", () => {
    expect(parseVideoLink('https://vimeo.com/76979871')).toEqual({ provider: 'vimeo', key: '76979871', url: 'https://vimeo.com/76979871' })
    expect(parseVideoLink('https://vimeo.com/76979871/AB12cd34ef')).toEqual({
      provider: 'vimeo',
      key: '76979871/ab12cd34ef',
      url: 'https://vimeo.com/76979871/ab12cd34ef',
    })
    expect(parseVideoLink('https://vimeo.com/channels/staffpicks/76979871')).toMatchObject({ key: '76979871' })
    expect(parseVideoLink('https://player.vimeo.com/video/76979871?h=ab12cd34ef')).toMatchObject({ key: '76979871/ab12cd34ef' })
    expect(parseVideoLink('https://vimeo.com/about')).toBeNull()
  })

  it('takes nothing else', () => {
    for (const input of [
      '',
      'not a link',
      'javascript:alert(1)',
      'ftp://youtu.be/dQw4w9WgXcQ',
      'https://example.com/watch?v=dQw4w9WgXcQ',
      'https://youtube.com.example.net/watch?v=dQw4w9WgXcQ',
    ]) {
      expect(parseVideoLink(input), input).toBeNull()
    }
  })

  it('makes the player address, started at once', () => {
    expect(embedUrl('youtube', 'dQw4w9WgXcQ')).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1&rel=0&playsinline=1')
    expect(embedUrl('bilibili', 'BV1GJ411x7h7')).toContain('//player.bilibili.com/player.html?bvid=BV1GJ411x7h7&')
    expect(embedUrl('bilibili', 'av170001')).toContain('?aid=170001&')
    expect(embedUrl('vimeo', '76979871/ab12cd34ef')).toBe('https://player.vimeo.com/video/76979871?autoplay=1&dnt=1&h=ab12cd34ef')
  })

  it('writes the length the way players do', () => {
    expect(formatDuration(5)).toBe('0:05')
    expect(formatDuration(768)).toBe('12:48')
    expect(formatDuration(3723)).toBe('1:02:03')
    expect(isoDuration('PT12M48S')).toBe(768)
    expect(isoDuration('PT1H2M3S')).toBe(3723)
    expect(isoDuration('P1DT1S')).toBe(86401)
    expect(isoDuration('P0D')).toBeNull()
    expect(isoDuration('12:48')).toBeNull()
  })
})

/** A fetch that answers from a table of address prefixes, and remembers what was asked. */
function fakeFetch(routes: [prefix: string, answer: unknown | number | Response][]) {
  const asked: string[] = []
  const fetcher = (async (input: RequestInfo | URL) => {
    const url = String(input)
    asked.push(url)
    const route = routes.find(([prefix]) => url.startsWith(prefix))
    if (!route) return new Response('', { status: 404 })
    const answer = route[1]
    if (answer instanceof Response) return answer
    return typeof answer === 'number' ? new Response('', { status: answer }) : Response.json(answer)
  }) as typeof fetch
  return { fetcher, asked }
}

const youtubeLink: VideoLink = { provider: 'youtube', key: 'dQw4w9WgXcQ', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' }

describe('circles: what the video sites say', () => {
  it('YouTube without a key: oEmbed, no length, covers from i.ytimg.com', async () => {
    const { fetcher, asked } = fakeFetch([['https://www.youtube.com/oembed?', { title: '  Never\ngonna  ', author_name: 'Rick', thumbnail_url: 'https://elsewhere.example/x.jpg' }]])
    expect(await readVideoInfo(youtubeLink, { fetch: fetcher, youtubeKey: '' })).toEqual({
      title: 'Never gonna',
      channel: 'Rick',
      duration: null,
      covers: ['https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg', 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg'],
    })
    expect(asked).toHaveLength(1)
    expect(new URL(asked[0]).searchParams.get('url')).toBe(youtubeLink.url)
  })

  it('YouTube with a key: the Data API, with the length; oEmbed when the key stops working', async () => {
    const api = {
      items: [
        {
          snippet: { title: 'Never gonna', channelTitle: 'Rick', thumbnails: { high: { url: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg' } } },
          contentDetails: { duration: 'PT3M33S' },
        },
      ],
    }
    const working = fakeFetch([['https://www.googleapis.com/youtube/v3/videos?', api]])
    expect(await readVideoInfo(youtubeLink, { fetch: working.fetcher, youtubeKey: 'key' })).toMatchObject({ title: 'Never gonna', channel: 'Rick', duration: 213 })
    expect(new URL(working.asked[0]).searchParams.get('key')).toBe('key')

    const quota = fakeFetch([
      ['https://www.googleapis.com/', 403],
      ['https://www.youtube.com/oembed?', { title: 'Never gonna', author_name: 'Rick' }],
    ])
    expect(await readVideoInfo(youtubeLink, { fetch: quota.fetcher, youtubeKey: 'key' })).toMatchObject({ title: 'Never gonna', duration: null })
    expect(quota.asked).toHaveLength(2)

    // The API answers, but the video is not there.
    const gone = fakeFetch([['https://www.googleapis.com/', { items: [] }]])
    expect(await readVideoInfo(youtubeLink, { fetch: gone.fetcher, youtubeKey: 'key' })).toBeNull()
  })

  it('Bilibili: found only with code 0; the cover over https', async () => {
    const link: VideoLink = { provider: 'bilibili', key: 'BV1GJ411x7h7', url: 'https://www.bilibili.com/video/BV1GJ411x7h7/' }
    const found = fakeFetch([
      ['https://api.bilibili.com/x/web-interface/view?bvid=BV1GJ411x7h7', { code: 0, data: { title: '视频', owner: { name: 'UP 主' }, duration: 768, pic: 'http://i0.hdslb.com/bfs/archive/a.jpg' } }],
    ])
    expect(await readVideoInfo(link, { fetch: found.fetcher })).toEqual({ title: '视频', channel: 'UP 主', duration: 768, covers: ['https://i0.hdslb.com/bfs/archive/a.jpg'] })

    const hidden = fakeFetch([['https://api.bilibili.com/', { code: 62002, message: '稿件不可见' }]])
    expect(await readVideoInfo(link, { fetch: hidden.fetcher })).toBeNull()

    const av = fakeFetch([])
    await readVideoInfo({ provider: 'bilibili', key: 'av170001', url: 'https://www.bilibili.com/video/av170001/' }, { fetch: av.fetcher })
    expect(av.asked[0]).toBe('https://api.bilibili.com/x/web-interface/view?aid=170001')
  })

  it('Vimeo: oEmbed with the length and a large cover', async () => {
    const { fetcher, asked } = fakeFetch([['https://vimeo.com/api/oembed.json?', { title: 'The Mountain', author_name: 'TSO', duration: 190, thumbnail_url: 'https://i.vimeocdn.com/video/1.jpg' }]])
    expect(await readVideoInfo({ provider: 'vimeo', key: '76979871', url: 'https://vimeo.com/76979871' }, { fetch: fetcher })).toEqual({
      title: 'The Mountain',
      channel: 'TSO',
      duration: 190,
      covers: ['https://i.vimeocdn.com/video/1.jpg'],
    })
    expect(new URL(asked[0]).searchParams.get('width')).toBe('1280')
  })

  it('never throws: a site that is down is nothing known', async () => {
    const down = (async () => {
      throw new TypeError('fetch failed')
    }) as typeof fetch
    expect(await readVideoInfo(youtubeLink, { fetch: down, youtubeKey: '' })).toBeNull()
    const notJson = fakeFetch([['https://www.youtube.com/', new Response('<html>', { status: 200 })]])
    expect(await readVideoInfo(youtubeLink, { fetch: notJson.fetcher, youtubeKey: '' })).toBeNull()
  })

  it('follows a b23.tv link by its redirect, and only to a Bilibili video', async () => {
    const redirect = (location: string) => new Response(null, { status: 302, headers: { location } })
    const video = fakeFetch([['https://b23.tv/aBc1234', redirect('https://www.bilibili.com/video/BV1GJ411x7h7?share_source=copy')]])
    expect(await followShortLink({ provider: 'bilibili', short: 'aBc1234' }, { fetch: video.fetcher })).toEqual({
      provider: 'bilibili',
      key: 'BV1GJ411x7h7',
      url: 'https://www.bilibili.com/video/BV1GJ411x7h7/',
    })
    const elsewhere = fakeFetch([['https://b23.tv/', redirect('https://www.youtube.com/watch?v=dQw4w9WgXcQ')]])
    expect(await followShortLink({ provider: 'bilibili', short: 'aBc1234' }, { fetch: elsewhere.fetcher })).toBeNull()
    const nowhere = fakeFetch([['https://b23.tv/', 404]])
    expect(await followShortLink({ provider: 'bilibili', short: 'aBc1234' }, { fetch: nowhere.fetcher })).toBeNull()
  })
})

describe('circles: getting a picture ready in the browser', () => {
  const mb = 1024 * 1024

  it('sends what is already small enough, shrinks the rest', () => {
    expect(uploadPlan({ type: 'image/jpeg', size: 2 * mb }, { width: 2000, height: 1500 })).toBe('send')
    expect(uploadPlan({ type: 'image/jpeg', size: 2 * mb }, { width: 4032, height: 3024 })).toBe('shrink')
    expect(uploadPlan({ type: 'image/png', size: 6 * mb }, { width: 1200, height: 900 })).toBe('shrink')
    // Opened by the browser, but not one of the four types: redrawn.
    expect(uploadPlan({ type: 'image/heic', size: 2 * mb }, { width: 1200, height: 900 })).toBe('shrink')
  })

  it('sends GIFs as they are, up to 4 MB', () => {
    expect(uploadPlan({ type: 'image/gif', size: mediaRules.maxUploadBytes }, null)).toBe('send')
    expect(uploadPlan({ type: 'image/gif', size: mediaRules.maxUploadBytes + 1 }, null)).toBe('gif-too-big')
  })

  it('turns down files over 20 MB and files that are not pictures', () => {
    expect(uploadPlan({ type: 'image/jpeg', size: mediaRules.maxPickedBytes + 1 }, { width: 100, height: 100 })).toBe('too-big')
    expect(uploadPlan({ type: 'application/pdf', size: mb }, null)).toBe('type')
  })

  it('fits the long side within 2048 px, never enlarging', () => {
    expect(fitWithin(4032, 3024)).toEqual({ width: 2048, height: 1536 })
    expect(fitWithin(3024, 4032)).toEqual({ width: 1536, height: 2048 })
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 })
    expect(fitWithin(100_000, 10)).toEqual({ width: 2048, height: 1 })
  })
})

describe('circles: what an uploaded file really is', () => {
  const picture = (format: 'jpeg' | 'png' | 'webp' | 'gif', width = 32, height = 24) =>
    sharp({ create: { width, height, channels: 3, background: '#d94f3d' } })
      .toFormat(format)
      .toBuffer()

  it('reads the type from the bytes', async () => {
    expect(await inspectImage(await picture('jpeg'))).toEqual({ mimeType: 'image/jpeg', width: 32, height: 24 })
    expect(await inspectImage(await picture('png'))).toMatchObject({ mimeType: 'image/png' })
    expect(await inspectImage(await picture('webp'))).toMatchObject({ mimeType: 'image/webp' })
    expect(await inspectImage(await picture('gif'))).toMatchObject({ mimeType: 'image/gif' })
  })

  it('turns down everything else', async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>alert(1)</script></svg>')
    expect(await inspectImage(svg)).toBeNull()
    expect(await inspectImage(await sharp({ create: { width: 8, height: 8, channels: 3, background: '#fff' } }).tiff().toBuffer())).toBeNull()
    expect(await inspectImage(Buffer.from('GIF89a, but not really'))).toBeNull()
    expect(await inspectImage(new Uint8Array())).toBeNull()
  })

  it('turns down pictures with too many pixels', async () => {
    // 8000 × 8000 is 64 million pixels; only the header is read.
    const huge = await sharp({ create: { width: 8000, height: 8000, channels: 3, background: '#fff' } })
      .png({ compressionLevel: 9 })
      .toBuffer()
    expect(await inspectImage(huge)).toBeNull()
  })
})
