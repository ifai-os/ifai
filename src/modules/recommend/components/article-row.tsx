import { useTranslations } from 'next-intl'

import { LocalTime } from '@/components/local-time'
import { Link } from '@/i18n/navigation'

import type { ArticleCard } from '../list'
import { articleHref, listHref } from '../rules'
import { Byline } from './byline'

/**
 * One article in the list (「IFAI 推荐（原社区）」board): title, a one-line summary, byline, date,
 * reading time and tags; the cover as a small picture on the right.
 */
export function ArticleRow({ article }: { article: ArticleCard }) {
  const t = useTranslations('recommend')
  return (
    <article className="flex gap-4 border-b border-hairline py-5 md:gap-6">
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <h3 lang={article.lang} className="text-title wrap-anywhere">
          <Link href={articleHref(article.id)} className="hover:text-accent-ink">
            {article.title}
          </Link>
        </h3>
        {article.summary && (
          <p lang={article.lang} className="line-clamp-2 text-ui text-ink-3 md:line-clamp-1">
            {article.summary}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1 text-meta text-ink-4">
          <Byline />
          <LocalTime iso={article.publishedAt} style="date" />
          <span>{t('minutes', { count: article.minutes })}</span>
          {article.tags.length > 0 && (
            <ul className="flex flex-wrap gap-2 md:ml-auto">
              {article.tags.slice(0, 2).map((tag) => (
                <li key={tag}>
                  <Link
                    href={listHref({ tag })}
                    lang={article.lang}
                    className="rounded-tag bg-surface px-2 py-0.5 text-small text-ink-4 hover:text-ink"
                  >
                    {tag}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      {article.cover && (
        // eslint-disable-next-line @next/next/no-img-element -- an editor's upload, served as it is (R2 or ./media)
        <img
          src={article.cover.url}
          alt=""
          width={article.cover.width ?? undefined}
          height={article.cover.height ?? undefined}
          loading="lazy"
          className="h-16 w-24 flex-none self-center rounded-thumb border border-hairline object-cover md:h-20 md:w-30"
        />
      )}
    </article>
  )
}
