import { useTranslations } from 'next-intl'

import { buttonClass } from '@/components/button'
import { ShareButton } from '@/components/share-button'
import { localeNames, locales, type Locale } from '@/i18n/config'
import { Link } from '@/i18n/navigation'

import { posterVersion, type PosterSnapshot } from '../../poster/snapshot'
import { posterDay, posterHref, posterImagePath, storyHref } from '../list-params'

type Props = {
  snapshot: PosterSnapshot
  locale: Locale
  neighbours: { earlier: string | null; later: string | null }
}

/**
 * A day's poster (docs/specs/daily.md「页面」`/[locale]/daily/poster/[YYYY-MM-DD]`): the image in
 * the reader's language, downloads in all five, and the stories on it linking to their pages.
 * Everything comes from what the editor generated, so the page matches the images.
 */
export function PosterPageView({ snapshot, locale, neighbours }: Props) {
  const t = useTranslations('poster')
  const daily = useTranslations('daily')
  const names = useTranslations('categories')
  const version = posterVersion(snapshot)
  const day = posterDay(snapshot.date, locale)
  const count = snapshot.entries.length

  return (
    <main id="main" className="mx-auto flex w-full max-w-content flex-col gap-6 px-4 pt-5 pb-16 md:gap-8 md:pt-8 md:pb-24">
      <nav aria-label={daily('breadcrumb')} className="text-meta text-ink-4">
        <ol className="flex flex-wrap items-center gap-2">
          <li className="flex items-center gap-2">
            <Link href="/daily" className="hover:text-ink">
              {daily('title')}
            </Link>
            <span aria-hidden="true">/</span>
          </li>
          <li aria-current="page" className="text-ink">
            {t('pageTitle', { date: day })}
          </li>
        </ol>
      </nav>

      <div className="flex flex-col gap-8 md:flex-row md:items-start md:gap-12">
        {/* eslint-disable-next-line @next/next/no-img-element -- the image is already a sized PNG made for sharing */}
        <img
          src={posterImagePath(locale, snapshot.date, version)}
          width={1080}
          height={1920}
          alt={t('imageAlt', { date: day, count })}
          className="h-auto w-full max-w-side self-center rounded-card border border-surface-2 md:flex-none md:self-start"
        />

        <article className="flex min-w-0 flex-1 flex-col gap-6">
          <header className="flex flex-col gap-2">
            <h1 className="text-h1">{t('title')}</h1>
            <p className="text-meta text-ink-4">
              {day} · {t('count', { count })}
            </p>
          </header>

          <section aria-labelledby="poster-downloads" className="flex flex-col gap-3">
            <h2 id="poster-downloads" className="text-h3 font-semibold">
              {t('downloads')}
            </h2>
            <ul className="flex flex-wrap gap-2">
              {locales.map((other) => (
                <li key={other}>
                  <a
                    href={posterImagePath(other, snapshot.date, version)}
                    download={`ifai-${snapshot.date}-${other}.png`}
                    hrefLang={other}
                    className={buttonClass(other === locale ? 'primary' : 'secondary')}
                  >
                    {t('download', { language: localeNames[other] })}
                  </a>
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="poster-stories" className="flex flex-col gap-2">
            <h2 id="poster-stories" className="text-h3 font-semibold">
              {t('stories')}
            </h2>
            <ol className="flex flex-col">
              {snapshot.entries.map((entry, index) => (
                <li key={entry.id} className="grid grid-cols-[32px_minmax(0,1fr)] gap-2 border-t border-surface-2 py-3">
                  <span className={`pt-0.5 text-meta tabular-nums ${index === 0 ? 'font-semibold text-accent-ink' : 'text-ink-4'}`}>
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <div className="flex min-w-0 flex-col gap-1">
                    <Link href={storyHref(entry.slug)} lang={entry.title[locale].lang} className="text-body font-medium hover:text-accent-ink">
                      {entry.title[locale].value}
                    </Link>
                    <span className="text-small text-ink-4">
                      {[index === 0 ? t('head') : null, names(entry.category), entry.source].filter(Boolean).join(' · ')}
                    </span>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <div className="flex flex-wrap items-center gap-2">
            <ShareButton title={t('pageTitle', { date: day })} className={buttonClass('secondary')} labels={{ share: daily('share'), copied: daily('copied') }} />
            {neighbours.earlier && (
              <Link href={posterHref(neighbours.earlier)} rel="prev" className={buttonClass('secondary')}>
                {t('earlier')} · {posterDay(neighbours.earlier, locale, false)}
              </Link>
            )}
            {neighbours.later && (
              <Link href={posterHref(neighbours.later)} rel="next" className={buttonClass('secondary')}>
                {t('later')} · {posterDay(neighbours.later, locale, false)}
              </Link>
            )}
          </div>
        </article>
      </div>
    </main>
  )
}
