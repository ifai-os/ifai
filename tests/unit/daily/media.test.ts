import { parseHTML } from 'linkedom'
import { describe, expect, it } from 'vitest'

import { embedUrl, findMedia, parseVideo, usableImage, videoUrl } from '@/modules/daily/media'
import { mediaOf } from '@/modules/daily/public/story-item'
import { pickMedia } from '@/modules/daily/write/media'

const page = (head: string, body = '') => parseHTML(`<html><head>${head}</head><body>${body}</body></html>`).document

describe('video addresses', () => {
  it('reads YouTube, Vimeo and video files', () => {
    expect(parseVideo('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10')).toEqual({ provider: 'youtube', id: 'dQw4w9WgXcQ' })
    expect(parseVideo('https://youtu.be/dQw4w9WgXcQ')).toEqual({ provider: 'youtube', id: 'dQw4w9WgXcQ' })
    expect(parseVideo('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0')).toEqual({ provider: 'youtube', id: 'dQw4w9WgXcQ' })
    expect(parseVideo('https://m.youtube.com/shorts/dQw4w9WgXcQ')).toEqual({ provider: 'youtube', id: 'dQw4w9WgXcQ' })
    expect(parseVideo('https://vimeo.com/76979871')).toEqual({ provider: 'vimeo', id: '76979871' })
    expect(parseVideo('https://player.vimeo.com/video/76979871?h=abc')).toEqual({ provider: 'vimeo', id: '76979871' })
    expect(parseVideo('https://cdn.example.com/demo.mp4#t=3')).toEqual({ provider: 'file', url: 'https://cdn.example.com/demo.mp4' })
  })

  it('turns down everything else', () => {
    for (const input of ['', 'not a url', 'https://www.youtube.com/channel/UC123', 'https://x.com/a/status/1', 'ftp://example.com/a.mp4', 'https://vimeo.com/about']) {
      expect(parseVideo(input), input).toBeNull()
    }
  })

  it('plays YouTube without cookies and Vimeo without tracking', () => {
    expect(embedUrl({ provider: 'youtube', id: 'dQw4w9WgXcQ' })).toMatch(/^https:\/\/www\.youtube-nocookie\.com\/embed\/dQw4w9WgXcQ\?autoplay=1/)
    expect(embedUrl({ provider: 'vimeo', id: '76979871' })).toContain('dnt=1')
    expect(embedUrl({ provider: 'file', url: 'https://cdn.example.com/a.mp4' })).toBeNull()
    expect(videoUrl({ provider: 'youtube', id: 'dQw4w9WgXcQ' })).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
  })
})

describe('the media an article page offers', () => {
  it('takes the first embedded video, then og:image', () => {
    const document = page(
      '<meta property="og:image" content="/images/cover.jpg"><meta property="og:image:width" content="1200">',
      '<article><p>Watch</p><iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ"></iframe><iframe src="https://player.vimeo.com/video/76979871"></iframe></article>',
    )
    expect(findMedia(document, 'https://news.example.com/post')).toEqual({
      image: 'https://news.example.com/images/cover.jpg',
      video: { provider: 'youtube', id: 'dQw4w9WgXcQ' },
    })
  })

  it('falls back to og:video and twitter:image', () => {
    const document = page('<meta property="og:video" content="https://vimeo.com/76979871"><meta name="twitter:image" content="https://cdn.example.com/a.png">')
    expect(findMedia(document, 'https://news.example.com/post')).toEqual({ image: 'https://cdn.example.com/a.png', video: { provider: 'vimeo', id: '76979871' } })
  })

  it('skips logos, SVGs, small images and links to video files', () => {
    expect(findMedia(page('<meta property="og:image" content="https://example.com/static/logo-share.png">'), 'https://example.com/a')).toEqual({})
    expect(findMedia(page('<meta property="og:image" content="https://example.com/a.svg">'), 'https://example.com/a')).toEqual({})
    expect(findMedia(page('<meta property="og:image" content="https://example.com/a.jpg"><meta property="og:image:width" content="200">'), 'https://example.com/a')).toEqual({})
    expect(findMedia(page('', '<article><a href="https://example.com/raw.mp4">download</a></article>'), 'https://example.com/a')).toEqual({})
    expect(usableImage('https://example.com/photo.jpg')).toBe(true)
  })
})

describe('choosing and showing a story’s media', () => {
  it('prefers a video from any report, else the first picture', () => {
    const picture = { sourceName: 'Maker', media: { image: 'https://maker.example/a.jpg' } }
    const video = { sourceName: 'Outlet', media: { video: { provider: 'youtube', id: 'dQw4w9WgXcQ' } as const, image: 'https://outlet.example/b.jpg' } }
    expect(pickMedia([picture, video])).toEqual({ video: video.media.video, image: video.media.image, credit: 'Outlet' })
    expect(pickMedia([picture])).toEqual({ image: picture.media.image, credit: 'Maker' })
    expect(pickMedia([])).toBeNull()
  })

  it('shows nothing without a picture or a playable video', () => {
    const image = { id: 1, alt: 'x', url: '/api/media/file/a.jpg', width: 1200, height: 630, updatedAt: '', createdAt: '' }
    expect(mediaOf({ kind: 'image', image, credit: 'Maker' })).toEqual({ kind: 'image', picture: { url: image.url, width: 1200, height: 630 }, credit: 'Maker' })
    expect(mediaOf({ kind: 'image', image: 1 })).toBeNull()
    expect(mediaOf({ kind: 'video', videoUrl: 'https://youtu.be/dQw4w9WgXcQ' })).toEqual({
      kind: 'video',
      video: { provider: 'youtube', id: 'dQw4w9WgXcQ' },
      picture: null,
      credit: null,
    })
    expect(mediaOf({ kind: 'video', videoUrl: 'https://example.com/page' })).toBeNull()
    expect(mediaOf({ kind: 'none' })).toBeNull()
  })
})
