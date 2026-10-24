import { useTranslations } from 'next-intl'

import { buttonBase, buttonClass } from '@/components/button'
import { LocalTime } from '@/components/local-time'
import { ShareButton } from '@/components/share-button'
import { Link } from '@/i18n/navigation'
import type { AuthProviders } from '@/lib/auth/providers'
import { SaveButton } from '@/modules/saves/components/save-button'
import { SaveProvider } from '@/modules/saves/components/save-provider'

import type { StoryDetail } from '../story-item'
import { listHref, storyHref } from '../list-params'
import { StoryFigure } from './story-media'

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

/**
 * A story's page (「IFAI 资讯详情页 · v1」board): title and times, summary, try-it, sources, save
 * and share, other developments. The page stays static; the save state is read in the browser.
 */
export function StoryDetailView({ story, signIn }: { story: StoryDetail; signIn: AuthProviders }) {
  const t = useTranslations('daily')
  const names = useTranslations('categories')
  const card = useTranslations('card')

  return (
    <main id="main" className="mx-auto flex w-full max-w-content flex-col gap-6 px-4 pt-5 pb-16 md:gap-8 md:pt-8 md:pb-24">
      <nav aria-label={t('breadcrumb')} className="text-meta text-ink-4">
        <ol className="flex flex-wrap items-center gap-2">
          <li className="flex items-center gap-2">
            <Link href="/daily" className="hover:text-ink">
              {t('title')}
            </Link>
            <span aria-hidden="true">/</span>
          </li>
          <li className="flex items-center gap-2">
            <Link href={listHref({ category: story.category })} className="hover:text-ink">
              {names(story.category)}
            </Link>
            <span aria-hidden="true">/</span>
          </li>
          <li aria-current="page" lang={story.title.lang} className="min-w-0 truncate text-ink">
            {story.title.value}
          </li>
        </ol>
      </nav>

      <div className="flex flex-col gap-8 md:flex-row md:items-start md:gap-12">
        <article className="flex w-full max-w-read min-w-0 flex-col gap-6">
          <header className="flex flex-col gap-3">
            <p className="text-meta font-medium text-accent">{names(story.category)}</p>
            <h1 lang={story.title.lang} className="text-h1 wrap-anywhere md:text-h1-article">
              {story.title.value}
            </h1>
            <p className="flex flex-wrap gap-x-3 gap-y-1 text-meta text-ink-4">
              <span>
                {t('publishedAt')} <LocalTime iso={story.publishedAt} zone />
              </span>
              {story.correctedAt && (
                <span>
                  {t('correctedAt')} <LocalTime iso={story.correctedAt} />
                </span>
              )}
              <span>{card('moreSources', { count: story.moreReports })}</span>
            </p>
          </header>

          {story.summary && (
            <p lang={story.summary.lang} className="text-body-article whitespace-pre-line text-ink-2">
              {story.summary.value}
            </p>
          )}

          <StoryFigure story={story} />

          {story.tryIt && (
            <section aria-labelledby="try-it" className="flex flex-col gap-1.5 rounded-card bg-surface px-5 py-4">
              <h2 id="try-it" className="text-ui font-semibold text-accent">
                {t('tryIt')}
              </h2>
              <p lang={story.tryIt.lang} className="text-body whitespace-pre-line text-ink-2">
                {story.tryIt.value}
              </p>
            </section>
          )}

          {story.correctedAt && (
            <p role="note" className="rounded-tile bg-info-soft px-4 py-3 text-meta text-ink-2">
              {t('corrected')} <LocalTime iso={story.correctedAt} zone />
            </p>
          )}

          {story.sources.length > 0 && (
            <section aria-labelledby="sources" className="flex flex-col gap-2">
              <h2 id="sources" className="text-h3 font-semibold">
                {t('sources')}{' '}
                <span className="font-normal text-ink-4">({story.sources.length})</span>
              </h2>
              <ol className="flex flex-col">
                {story.sources.map((source, index) => (
                  <li key={`${source.url}-${index}`} className="grid grid-cols-[32px_minmax(0,1fr)] gap-2 border-t border-surface-2 py-3">
                    <span className="pt-0.5 text-meta text-ink-4 tabular-nums">[{index + 1}]</span>
                    <div className="flex min-w-0 flex-col gap-1">
                      <a href={source.url} target="_blank" rel="noopener" className="text-body font-medium wrap-anywhere hover:text-accent">
                        {source.name}
                        <span className="sr-only">{t('newTab')}</span>
                      </a>
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-small text-ink-4">
                        <span className="rounded-pill border border-line px-2 py-0.5">{t(`roles.${source.role}`)}</span>
                        {source.publishedAt && <LocalTime iso={source.publishedAt} />}
                        <span className="truncate">{hostOf(source.url)}</span>
                      </span>
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          )}

          <div className="flex flex-wrap gap-2">
            <SaveProvider target={{ type: 'story', id: story.id }} signIn={signIn}>
              <SaveButton className={`${buttonBase} border border-line bg-bg hover:border-ink-4`} />
            </SaveProvider>
            <ShareButton
              title={story.title.value}
              className={buttonClass('secondary')}
              labels={{ share: t('share'), copied: t('copied') }}
            />
          </div>
        </article>

        {story.developments.length > 0 && (
          <aside className="w-full md:w-80 md:flex-none">
            <section aria-labelledby="developments" className="flex flex-col gap-2 rounded-card border border-surface-2 bg-surface p-5">
              <h2 id="developments" className="text-ui font-semibold text-ink-4">
                {t('developments')}
              </h2>
              <ol className="flex flex-col">
                {story.developments.map((other) => (
                  <li key={other.id} className="border-t border-line py-3">
                    <Link href={storyHref(other.slug)} className="flex flex-col gap-1">
                      <LocalTime iso={other.publishedAt} style="date" className="text-small text-ink-4" />
                      <span lang={other.title.lang} className="text-ui font-medium hover:text-accent">
                        {other.title.value}
                      </span>
                    </Link>
                  </li>
                ))}
              </ol>
            </section>
          </aside>
        )}
      </div>
    </main>
  )
}
