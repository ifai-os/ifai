/**
 * The poster image of one language: 1080 × 1920, dark, the head story large with its summary,
 * the others numbered below (docs/specs/daily.md「流程」11). Drawn from the snapshot frozen at
 * generation, with Next.js's image renderer (satori: flexbox and inline styles only, so the
 * colours below repeat the design tokens instead of using classes).
 */
import { ImageResponse } from 'next/og'
import { createTranslator } from 'next-intl'

import { messagesFileName, type Locale } from '@/i18n/config'
import type { InLanguage } from '@/lib/i18n/localized'
import { siteUrl } from '@/lib/site-url'

import { posterFamilies, posterFonts, type PosterText } from './fonts'
import { frame, lineHeights, POSTER_SIZE, posterHeight, posterType, titleLines, type PosterType } from './layout'
import { posterLogoSvg } from './logo'
import type { PosterEntry, PosterSnapshot } from './snapshot'

export { POSTER_SIZE } from './layout'

// The tokens of src/app/(frontend)/globals.css: night, white, accent.
const look = {
  night: '#1f2024',
  white: '#ffffff',
  accent: '#da282a',
  panel: 'rgba(255, 255, 255, 0.08)',
  rule: 'rgba(255, 255, 255, 0.14)',
  soft: 'rgba(255, 255, 255, 0.8)',
  quiet: 'rgba(255, 255, 255, 0.62)',
  faint: 'rgba(255, 255, 255, 0.42)',
}

const logo = `data:image/svg+xml;base64,${Buffer.from(posterLogoSvg).toString('base64')}`

/** Added to every text the renderer may cut, so its font has the glyph. */
const ELLIPSIS = '…'

export type PosterLabels = {
  brand: string
  /** The date large: "10月21日", "October 21". */
  day: string
  /** Year, weekday, time zone and the count: "2026年 · 星期三 · 上海时间 · 8 件大事". */
  line: string
  head: string
  footer: string
  category: (category: PosterEntry['category']) => string
}

/** The poster's words in its language, from messages/ (the `poster` and `categories` sections). */
export async function posterLabels(locale: Locale, snapshot: PosterSnapshot, site: string): Promise<PosterLabels> {
  const messages = (await import(`../../../../messages/${messagesFileName(locale)}.json`)).default
  const t = createTranslator({ locale, messages, namespace: 'poster' })
  const names = createTranslator({ locale, messages, namespace: 'categories' })
  const day = new Date(`${snapshot.date}T00:00:00Z`)
  const format = (options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(locale, { ...options, timeZone: 'UTC' }).format(day)
  return {
    brand: t('brand'),
    day: format({ month: 'long', day: 'numeric' }),
    line: t('imageLine', { year: format({ year: 'numeric' }), weekday: format({ weekday: 'long' }), count: snapshot.entries.length }),
    head: t('head'),
    footer: t('imageFooter', { site }),
    category: (category) => names(category),
  }
}

function meta(entry: PosterEntry, labels: PosterLabels): string {
  return [labels.category(entry.category), entry.source].filter(Boolean).join(' · ')
}

/** Every piece of text on the poster with its language, for the fonts. */
export function posterTexts(snapshot: PosterSnapshot, locale: Locale, labels: PosterLabels): PosterText[] {
  const own = (text: string): PosterText => ({ lang: locale, text })
  const texts: PosterText[] = [own(labels.brand), own(labels.day), own(labels.line), own(labels.head), own(labels.footer), own('0123456789')]
  for (const entry of snapshot.entries) {
    texts.push({ lang: entry.title[locale].lang, text: entry.title[locale].value + ELLIPSIS }, own(meta(entry, labels)))
    const summary = entry.summary[locale]
    if (summary) texts.push({ lang: summary.lang, text: summary.value + ELLIPSIS })
  }
  return texts
}

function textStyle(text: InLanguage<string>) {
  return {
    fontFamily: posterFamilies[text.lang],
    // Korean breaks lines between words; the other languages as their own rules say.
    wordBreak: text.lang === 'ko' ? ('keep-all' as const) : ('normal' as const),
  }
}

type PosterProps = {
  snapshot: PosterSnapshot
  locale: Locale
  labels: PosterLabels
  type: PosterType
  /** Room left over when the type is at its largest (few stories): half above the stories, half below. */
  lead: number
}

function Poster({ snapshot, locale, labels, type, lead }: PosterProps) {
  const [head, ...others] = snapshot.entries
  const summary = head?.summary[locale] ?? null

  return (
    <div
      style={{
        width: POSTER_SIZE.width,
        height: POSTER_SIZE.height,
        display: 'flex',
        flexDirection: 'column',
        padding: `${frame.top}px ${frame.side}px ${frame.bottom}px`,
        backgroundColor: look.night,
        color: look.white,
        fontFamily: posterFamilies[locale],
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexShrink: 0 }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- drawn into the image, not shown on a page */}
        <img src={logo} width={frame.logo} height={frame.logo} alt="" />
        <div style={{ display: 'flex', fontSize: 28, letterSpacing: 2, color: look.soft }}>{labels.brand}</div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', marginTop: frame.dateTop, gap: frame.dateGap, flexShrink: 0 }}>
        <div style={{ display: 'flex', fontSize: frame.dateSize, fontWeight: 700, lineHeight: lineHeights.date }}>{labels.day}</div>
        <div style={{ display: 'flex', fontSize: frame.lineSize, lineHeight: lineHeights.line, color: look.quiet }}>{labels.line}</div>
      </div>

      {head && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            flexShrink: 0,
            marginTop: frame.cardTop + lead,
            padding: frame.cardPad,
            gap: frame.cardGap,
            borderRadius: 32,
            backgroundColor: look.panel,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: frame.pillSize, lineHeight: lineHeights.pill }}>
            <div style={{ display: 'flex', padding: `${frame.pillPad}px 16px`, borderRadius: 999, backgroundColor: look.accent, fontWeight: 700 }}>
              {labels.head}
            </div>
            <div style={{ display: 'flex', color: look.soft }}>{meta(head, labels)}</div>
          </div>
          <div
            style={{
              display: 'block',
              lineClamp: titleLines.head,
              fontSize: type.headTitle,
              fontWeight: 700,
              lineHeight: lineHeights.headTitle,
              ...textStyle(head.title[locale]),
            }}
          >
            {head.title[locale].value}
          </div>
          {summary && (
            <div
              style={{
                display: 'block',
                lineClamp: type.summaryLines,
                fontSize: type.summary,
                lineHeight: lineHeights.summary,
                color: look.soft,
                ...textStyle(summary),
              }}
            >
              {summary.value}
            </div>
          )}
        </div>
      )}

      {/* Shrinks and cuts the last story rather than push the footer off the image. */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          flexShrink: 1,
          overflow: 'hidden',
          marginTop: frame.listTop,
          marginBottom: frame.footerGap,
        }}
      >
        {others.map((entry, index) => {
          const brief = type.briefLines > 0 ? entry.summary[locale] : null
          return (
            <div
              key={entry.id}
              style={{
                display: 'flex',
                flexShrink: 0,
                gap: frame.numberGap,
                padding: `${type.pad}px ${frame.storySide}px`,
                borderBottom: `1px solid ${index < others.length - 1 ? look.rule : 'transparent'}`,
              }}
            >
              <div style={{ display: 'flex', width: frame.number, fontSize: type.title, fontWeight: 700, lineHeight: lineHeights.title, color: look.faint }}>
                {String(index + 2).padStart(2, '0')}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: frame.storyGap }}>
                <div
                  style={{
                    display: 'block',
                    lineClamp: titleLines.other,
                    fontSize: type.title,
                    fontWeight: 700,
                    lineHeight: lineHeights.title,
                    ...textStyle(entry.title[locale]),
                  }}
                >
                  {entry.title[locale].value}
                </div>
                {brief && (
                  <div
                    style={{
                      display: 'block',
                      lineClamp: type.briefLines,
                      fontSize: type.brief,
                      lineHeight: lineHeights.brief,
                      color: look.soft,
                      ...textStyle(brief),
                    }}
                  >
                    {brief.value}
                  </div>
                )}
                <div style={{ display: 'flex', fontSize: type.meta, lineHeight: lineHeights.meta, color: look.quiet }}>{meta(entry, labels)}</div>
              </div>
            </div>
          )
        })}
      </div>

      <div
        style={{
          display: 'flex',
          flexShrink: 0,
          marginTop: 'auto',
          paddingTop: frame.footerPad,
          borderTop: `1px solid ${look.rule}`,
          fontSize: frame.footerSize,
          lineHeight: lineHeights.footer,
          color: look.quiet,
        }}
      >
        {labels.footer}
      </div>
    </div>
  )
}

export type PosterImageOptions = {
  /** Shown in the footer; defaults to this deployment's address without the scheme. */
  site?: string
  headers?: Record<string, string>
  fetcher?: typeof fetch
}

/** The PNG of one language. Rendering happens while the body is read; a font that cannot be loaded fails before that. */
export async function posterImage(
  snapshot: PosterSnapshot,
  locale: Locale,
  { site = new URL(siteUrl()).host, headers, fetcher }: PosterImageOptions = {},
): Promise<ImageResponse> {
  const labels = await posterLabels(locale, snapshot, site)
  const fonts = await posterFonts(posterTexts(snapshot, locale, labels), fetcher)
  const [head, ...others] = snapshot.entries
  const texts = {
    headTitle: head?.title[locale] ?? { value: '', lang: locale },
    summary: head?.summary[locale] ?? null,
    stories: others.map((entry) => ({ title: entry.title[locale], brief: entry.summary[locale] })),
  }
  const type = posterType(texts)
  // The estimate errs towards more lines, so the real room is at least this.
  const lead = Math.floor(Math.max(0, POSTER_SIZE.height - posterHeight(texts, type)) / 2)
  return new ImageResponse(<Poster snapshot={snapshot} locale={locale} labels={labels} type={type} lead={lead} />, {
    ...POSTER_SIZE,
    fonts,
    headers,
  })
}
