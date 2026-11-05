/**
 * The share picture of a story that has no picture of its own (docs/specs/daily.md「分享卡片」):
 * 1200 × 630, dark like the poster, the category and the title large, the site at the foot. Drawn
 * with the poster's renderer and fonts (Noto Sans of the title's language, from Google Fonts,
 * cut to the characters used); satori takes inline styles only, so colours repeat the tokens.
 */
import { ImageResponse } from 'next/og'
import { createTranslator } from 'next-intl'

import { messagesFileName, type Locale } from '@/i18n/config'
import { siteUrl } from '@/lib/site-url'

import { posterFamilies, posterFonts } from '../poster/fonts'
import { posterLogoSvg } from '../poster/logo'
import type { StoryDetail } from './story-item'
import { SHARE_IMAGE_SIZE } from './list-params'

const look = { night: '#1f2024', white: '#ffffff', accent: '#da282a', quiet: 'rgba(255, 255, 255, 0.62)' }
const logo = `data:image/svg+xml;base64,${Buffer.from(posterLogoSvg).toString('base64')}`

/** Title sizes by length: short titles big, long ones still in three lines. */
export function shareTitleSize(title: string): number {
  const length = Array.from(title).length
  // CJK characters are about twice as wide as Latin letters.
  const wide = /[぀-ヿ㐀-鿿가-힯]/.test(title)
  const room = wide ? length * 2 : length
  if (room <= 40) return 68
  if (room <= 70) return 60
  return 52
}

export async function storyShareImage(
  story: Pick<StoryDetail, 'title' | 'category'>,
  locale: Locale,
  { site = new URL(siteUrl()).host, fetcher }: { site?: string; fetcher?: typeof fetch } = {},
): Promise<ImageResponse> {
  const messages = (await import(`../../../../messages/${messagesFileName(locale)}.json`)).default
  const nav = createTranslator({ locale, messages, namespace: 'nav' })
  const categories = createTranslator({ locale, messages, namespace: 'categories' })
  const brand = `IFAI ${nav('daily')}`
  const category = categories(story.category)
  const title = story.title
  const fonts = await posterFonts(
    [
      { lang: locale, text: `${brand}${category}${site}…` },
      { lang: title.lang, text: `${title.value}…` },
    ],
    fetcher,
  )
  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          width: '100%',
          height: '100%',
          padding: '64px 72px',
          background: look.night,
          color: look.white,
          fontFamily: posterFamilies[locale],
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- drawn into the image, not shown on a page */}
          <img src={logo} width={56} height={56} alt="" />
          <div style={{ display: 'flex', fontSize: 30, fontWeight: 700 }}>{brand}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          <div style={{ display: 'flex', fontSize: 28, fontWeight: 700, color: look.accent }}>{category}</div>
          <div
            lang={title.lang}
            style={{
              display: 'block',
              lineClamp: 3,
              fontFamily: posterFamilies[title.lang],
              fontSize: shareTitleSize(title.value),
              fontWeight: 700,
              lineHeight: 1.25,
            }}
          >
            {title.value}
          </div>
        </div>
        <div style={{ display: 'flex', fontSize: 26, color: look.quiet }}>{site}</div>
      </div>
    ),
    { ...SHARE_IMAGE_SIZE, fonts },
  )
}
