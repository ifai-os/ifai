import { describe, expect, it } from 'vitest'

import { isAbsoluteMediaUrl, mediaPublicBase, mediaSrcSet, publicFileUrl } from '@/lib/media-url'

describe('mediaPublicBase', () => {
  it('trims and drops trailing slashes', () => {
    expect(mediaPublicBase(' https://media.ifai.io/ ')).toBe('https://media.ifai.io')
    expect(mediaPublicBase('https://pub-123.r2.dev//')).toBe('https://pub-123.r2.dev')
  })

  it('is null when unset or not a web address', () => {
    expect(mediaPublicBase(undefined)).toBeNull()
    expect(mediaPublicBase('')).toBeNull()
    expect(mediaPublicBase('media.ifai.io')).toBeNull()
    expect(mediaPublicBase('ftp://media.ifai.io')).toBeNull()
  })
})

describe('publicFileUrl', () => {
  it('joins the folder and the encoded file name', () => {
    expect(publicFileUrl('https://media.ifai.io', 'media', 'a b.webp')).toBe('https://media.ifai.io/media/a%20b.webp')
    expect(publicFileUrl('https://media.ifai.io', 'media/0f3c', 'x.png')).toBe('https://media.ifai.io/media/0f3c/x.png')
    expect(publicFileUrl('https://media.ifai.io', '/media/', 'x.png')).toBe('https://media.ifai.io/media/x.png')
  })
})

describe('mediaSrcSet', () => {
  const base = 'https://media.ifai.io/media'

  it('lists the stored sizes and the original, narrowest first', () => {
    expect(
      mediaSrcSet(
        { url: `${base}/p.webp`, width: 1536 },
        { card: { url: `${base}/p-768x432.webp`, width: 768 }, thumb: { url: `${base}/p-320x180.webp`, width: 320 } },
      ),
    ).toBe(`${base}/p-320x180.webp 320w, ${base}/p-768x432.webp 768w, ${base}/p.webp 1536w`)
  })

  it('leaves out sizes that are missing or not smaller than the original', () => {
    expect(
      mediaSrcSet(
        { url: `${base}/s.webp`, width: 600 },
        { card: { url: null, width: null }, thumb: { url: `${base}/s-320x180.webp`, width: 320 } },
      ),
    ).toBe(`${base}/s-320x180.webp 320w, ${base}/s.webp 600w`)
    expect(mediaSrcSet({ url: `${base}/s.webp`, width: 600 }, undefined)).toBe(`${base}/s.webp 600w`)
  })

  it('is null for files this site serves, which next/image resizes', () => {
    expect(mediaSrcSet({ url: '/api/media/file/p.webp', width: 1536 }, { thumb: { url: '/api/media/file/p-320x180.webp', width: 320 } })).toBeNull()
  })

  it('tells whole addresses from site paths', () => {
    expect(isAbsoluteMediaUrl('https://media.ifai.io/media/p.webp')).toBe(true)
    expect(isAbsoluteMediaUrl('/api/media/file/p.webp')).toBe(false)
  })
})
