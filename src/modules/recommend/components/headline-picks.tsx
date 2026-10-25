import { useTranslations } from 'next-intl'

import { Link } from '@/i18n/navigation'

import type { ArticleCard } from '../list'
import { articleHref } from '../rules'
import { Byline } from './byline'

/**
 * The latest three picks at the top of the list (docs/specs/recommend.md 规则 10): the first as a
 * large card with its cover, the next two beside it. Each says why it was picked (规则 2).
 */
export function HeadlinePicks({ picks }: { picks: ArticleCard[] }) {
  const t = useTranslations('recommend')
  const channels = useTranslations('recommend.channels')
  const [lead, ...rest] = picks
  if (!lead) return null

  return (
    <section aria-labelledby="headline-picks" className="flex flex-col gap-4 md:flex-row md:flex-wrap">
      <h2 id="headline-picks" className="sr-only">
        {t('headlines')}
      </h2>
      <Link
        href={articleHref(lead.id)}
        className="group flex min-w-0 flex-col overflow-hidden rounded-hero border border-surface-2 bg-surface md:min-h-65 md:grow-2 md:basis-105 md:flex-row md:flex-wrap"
      >
        {lead.cover && (
          // eslint-disable-next-line @next/next/no-img-element -- an editor's upload, served as it is (R2 or ./media)
          <img
            src={lead.cover.url}
            alt=""
            width={lead.cover.width ?? undefined}
            height={lead.cover.height ?? undefined}
            className="aspect-[2/1] w-full object-cover md:aspect-auto md:max-h-80 md:min-h-57 md:w-auto md:min-w-0 md:flex-1 md:basis-75"
          />
        )}
        <div className="flex flex-col justify-end gap-3 p-6 md:flex-1 md:basis-55 md:px-7">
          <span className="self-start rounded-pill border border-surface-2 bg-bg px-2.5 py-1 text-small text-ink-2">
            {t('pickedIn', { channel: channels(lead.channel) })}
          </span>
          <span lang={lead.lang} className="text-h2 wrap-anywhere group-hover:text-accent-ink">
            {lead.title}
          </span>
          {lead.pick && (
            <span lang={lead.lang} className="text-ui text-ink-3">
              {lead.pick.reason}
            </span>
          )}
          <span className="flex flex-wrap items-center gap-x-2 text-meta text-ink-4">
            <Byline />
            <span aria-hidden="true">·</span>
            {t('minutes', { count: lead.minutes })}
          </span>
        </div>
      </Link>

      {rest.length > 0 && (
        <div className="flex flex-col gap-4 md:grow md:basis-65">
          {rest.map((article) => (
            <Link
              key={article.id}
              href={articleHref(article.id)}
              className="group flex flex-1 flex-col gap-2.5 rounded-hero border border-surface-2 bg-surface p-5"
            >
              <span className="text-small text-ink-4">{t('pickedIn', { channel: channels(article.channel) })}</span>
              <span lang={article.lang} className="text-title wrap-anywhere group-hover:text-accent-ink">
                {article.title}
              </span>
              {article.pick && (
                <span lang={article.lang} className="line-clamp-2 text-meta text-ink-3">
                  {article.pick.reason}
                </span>
              )}
            </Link>
          ))}
        </div>
      )}
    </section>
  )
}
