import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { MediaPicture } from '@/components/media-picture'

describe('MediaPicture', () => {
  it('draws a picture on the public bucket as a plain img over its stored sizes', () => {
    const srcSet = 'https://media.ifai.io/media/p-320x180.webp 320w, https://media.ifai.io/media/p.webp 1536w'
    const html = renderToStaticMarkup(
      <MediaPicture picture={{ url: 'https://media.ifai.io/media/p.webp', srcSet }} alt="" sizes="100vw" className="object-cover" />,
    )
    expect(html).toContain('src="https://media.ifai.io/media/p.webp"')
    expect(html).toContain(`srcSet="${srcSet}"`)
    expect(html).toContain('loading="lazy"')
    expect(html).not.toContain('/_next/image')
  })

  it('leaves this site’s files to next/image', () => {
    const html = renderToStaticMarkup(<MediaPicture picture={{ url: '/api/media/file/p.webp' }} alt="" sizes="100vw" priority />)
    expect(html).toContain('/_next/image?url=%2Fapi%2Fmedia%2Ffile%2Fp.webp')
  })
})
