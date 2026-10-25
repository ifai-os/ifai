import { useLocale, useTranslations } from 'next-intl'

import { buttonClass } from '@/components/button'
import { LocalTime } from '@/components/local-time'
import { ShareButton } from '@/components/share-button'
import { localeNames } from '@/i18n/config'
import { Link } from '@/i18n/navigation'

import type { ArticleDetail } from '../list'
import { articleHref, listHref } from '../rules'
import { ArticleBody } from './article-body'
import { Byline } from './byline'

/** The table of contents shows from two second-level headings up (docs/specs/recommend.md 规则 8). */
const tocFrom = 2

/**
 * An article's page (「IFAI 推荐 · 文章详情」board, type from「文章详情页」): channel and date,
 * title, byline and reading time, cover, the pick's reason, the body, tags and share; beside it
 * the contents and related articles, which phones get after the article (without the contents).
 */
export function ArticleDetailView({ article }: { article: ArticleDetail }) {
  const t = useTranslations('recommend')
  const channels = useTranslations('recommend.channels')
  const locale = useLocale()
  const channel = channels(article.channel)
  const showToc = article.toc.length >= tocFrom

  return (
    <main id="main" className="mx-auto flex w-full max-w-260 flex-col gap-6 px-4 pt-5 pb-16 md:pt-10 md:pb-24">
      <nav aria-label={t('breadcrumb')} className="text-meta text-ink-4">
        <ol className="flex flex-wrap items-center gap-2">
          <li className="flex items-center gap-2">
            <Link href="/recommend" className="hover:text-ink">
              {t('title')}
            </Link>
            <span aria-hidden="true">/</span>
          </li>
          <li>
            <Link href={listHref({ tab: 'latest', channel: article.channel })} className="hover:text-ink">
              {channel}
            </Link>
          </li>
        </ol>
      </nav>

      <div className="flex flex-col gap-10 md:flex-row md:flex-wrap md:items-start md:gap-x-16">
        <article className="flex w-full max-w-read min-w-0 flex-col md:grow-999 md:basis-140">
          <header className="flex flex-col">
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-small text-ink-4">
              <span className="flex items-center gap-1">
                <span aria-hidden="true" className="size-2.5 rounded-[3px] border-[1.5px] border-accent" />
                {article.pick ? t('pickedIn', { channel }) : channel}
              </span>
              <LocalTime iso={article.publishedAt} style="date" />
              {article.lang !== locale && <span>{t('articleLanguage', { language: localeNames[article.lang] })}</span>}
            </p>
            <h1 lang={article.lang} className="mt-3 text-h1 wrap-anywhere md:text-h1-article">
              {article.title}
            </h1>
            <div className="mt-6 flex flex-wrap items-center justify-between gap-3 text-meta">
              <Byline size={24} />
              <span className="text-small text-ink-4">{t('minutes', { count: article.minutes })}</span>
            </div>
            {article.coverFull && (
              // eslint-disable-next-line @next/next/no-img-element -- an editor's upload, served as it is (R2 or ./media)
              <img
                src={article.coverFull.url}
                alt={article.coverFull.alt}
                width={article.coverFull.width ?? undefined}
                height={article.coverFull.height ?? undefined}
                fetchPriority="high"
                className="mt-6 aspect-[2/1] w-full rounded-thumb object-cover"
              />
            )}
            {article.pick && (
              <p className="mt-6 rounded-tile bg-surface px-4 py-3 text-ui text-ink-2">
                <span className="font-medium text-accent-ink">{t('pickReason')}</span>
                <span aria-hidden="true"> · </span>
                <span lang={article.lang}>{article.pick.reason}</span>
              </p>
            )}
            {article.summary && !article.pick && (
              <p lang={article.lang} className="mt-6 text-title font-normal text-ink-3">
                {article.summary}
              </p>
            )}
          </header>

          <div className="mt-10">
            <ArticleBody body={article.body} lang={article.lang} />
          </div>

          <footer className="mt-10 flex flex-col gap-6 border-t border-surface-2 pt-6">
            {article.tags.length > 0 && (
              <ul aria-label={t('tags')} className="flex flex-wrap gap-2.5">
                {article.tags.map((tag) => (
                  <li key={tag}>
                    <Link
                      href={listHref({ tab: 'latest', tag })}
                      lang={article.lang}
                      className="flex rounded-pill bg-surface px-3 py-1 text-meta text-ink-2 hover:text-ink"
                    >
                      #{tag}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <div>
              <ShareButton title={article.title} className={buttonClass('secondary')} labels={{ share: t('share'), copied: t('copied') }} />
            </div>
          </footer>
        </article>

        {(showToc || article.related.length > 0) && (
          <aside className="flex w-full flex-col gap-8 md:sticky md:top-20 md:max-w-70 md:grow md:basis-65">
            {showToc && (
              <nav aria-labelledby="toc" className="hidden flex-col md:flex">
                <h2 id="toc" className="pb-2 text-ui font-medium">
                  {t('toc')}
                </h2>
                <ol lang={article.lang}>
                  {article.toc.map((entry) => (
                    <li key={entry.id}>
                      <a
                        href={`#${entry.id}`}
                        className="flex min-h-9 items-center border-l-2 border-surface-2 py-1 pl-3 text-meta text-ink-4 hover:border-accent hover:text-ink"
                      >
                        {entry.text}
                      </a>
                    </li>
                  ))}
                </ol>
              </nav>
            )}
            {article.related.length > 0 && (
              <section aria-labelledby="related" className="flex flex-col">
                <h2 id="related" className="pb-1 text-ui font-medium">
                  {t('related')}
                </h2>
                <ul>
                  {article.related.map((other) => (
                    <li key={other.id} className="border-b border-hairline">
                      <Link href={articleHref(other.id)} className="flex flex-col gap-1 py-3">
                        <span lang={other.lang} className="text-meta wrap-anywhere hover:text-accent-ink">
                          {other.title}
                        </span>
                        <span className="text-small text-ink-4">
                          {channels(other.channel)} · {t('minutes', { count: other.minutes })}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </aside>
        )}
      </div>
    </main>
  )
}
