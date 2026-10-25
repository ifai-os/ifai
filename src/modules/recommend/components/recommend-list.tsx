import { getTranslations } from 'next-intl/server'

import { buttonClass } from '@/components/button'
import { EmptyState } from '@/components/states/empty-state'
import { ListLink, ListNavigationProvider, ListResults } from '@/components/states/list-navigation'

import { publishedArticles } from '../data'
import { headlineCount, hotTags, picksOf, selectArticles } from '../list'
import { articleTabs, isPlainList, listHref, type ListQuery } from '../rules'
import { ArticleListSkeleton } from './article-list-skeleton'
import { ArticleRow } from './article-row'
import { ChannelNav } from './channel-nav'
import { HeadlinePicks } from './headline-picks'

/** Whether a list page is past its end: the page answers 404 rather than an empty list under a new address. */
export async function listPageExists(query: ListQuery): Promise<boolean> {
  return query.page === 1 || selectArticles(await publishedArticles(), query).articles.length > 0
}

/**
 * The recommend list (「IFAI 推荐（原社区）」board): the latest picks on top (plain first page only),
 * then the channels, the list under 推荐 / 最新 and the popular tags beside it. Phones stack them,
 * the channels as a row of chips.
 */
export async function RecommendList({ query }: { query: ListQuery }) {
  const [t, all] = await Promise.all([getTranslations('recommend'), publishedArticles()])
  const result = selectArticles(all, query)
  const headlines = isPlainList(query) ? picksOf(all).slice(0, headlineCount) : []
  const tags = hotTags(all)
  const filtered = Boolean(query.channel || query.tag)
  const pill =
    'inline-flex h-10 items-center rounded-pill border border-line bg-bg px-6 text-meta text-ink-2 transition-colors hover:border-ink-4'

  return (
    <ListNavigationProvider>
      <main id="main" className="mx-auto flex w-full max-w-280 flex-col gap-6 px-4 pt-5 pb-16 md:gap-8 md:pt-8 md:pb-24">
        <h1 className="sr-only">{t('title')}</h1>
        {headlines.length > 0 && <HeadlinePicks picks={headlines} />}

        <div className="flex flex-col gap-5 md:flex-row md:flex-wrap md:items-start md:gap-x-12 md:gap-y-8">
          <div className="md:max-w-42.5 md:basis-37.5">
            <ChannelNav current={query.channel} tab={result.tab} />
          </div>

          <div className="flex min-w-0 flex-col gap-6 md:grow-999 md:basis-115">
            <div className="flex flex-col">
              {query.tag && (
                <div className="flex flex-wrap items-baseline justify-between gap-3 pb-4">
                  <h2 className="text-h2 wrap-anywhere">{t('tagHeading', { tag: query.tag })}</h2>
                  <ListLink href={listHref({ tab: result.tab, channel: query.channel })} className="text-meta text-ink-4 hover:text-ink">
                    {t('seeAll')}
                  </ListLink>
                </div>
              )}
              <nav aria-label={t('tabsLabel')} className="flex gap-7 border-b border-line">
                {articleTabs.map((tab) => {
                  const active = tab === result.tab
                  return (
                    <ListLink
                      key={tab}
                      href={listHref({ tab, channel: query.channel, tag: query.tag })}
                      aria-current={active ? 'page' : undefined}
                      className={`flex min-h-11 items-center text-title ${
                        active ? 'text-ink shadow-[inset_0_-2px_0_var(--color-ink)]' : 'text-ink-4 hover:text-ink'
                      }`}
                    >
                      {t(`tabs.${tab}`)}
                    </ListLink>
                  )
                })}
              </nav>

              <ListResults skeleton={<ArticleListSkeleton count={Math.min(Math.max(result.articles.length, 3), 6)} />}>
                {result.articles.length > 0 ? (
                  <div>
                    {result.articles.map((article) => (
                      <ArticleRow key={article.id} article={article} />
                    ))}
                  </div>
                ) : all.length === 0 ? (
                  <div className="pt-6">
                    <EmptyState title={t('emptyTitle')} body={t('emptyBody')} />
                  </div>
                ) : result.tab === 'picks' ? (
                  <div className="pt-6">
                    <EmptyState title={t('emptyPicksTitle')} body={t('emptyPicksBody')}>
                      <ListLink href={listHref({ tab: 'latest', channel: query.channel, tag: query.tag })} className={buttonClass('secondary')}>
                        {t('showLatest')}
                      </ListLink>
                    </EmptyState>
                  </div>
                ) : (
                  <div className="pt-6">
                    <EmptyState title={t('emptyFilteredTitle')} body={t('emptyFilteredBody')}>
                      {filtered && (
                        <ListLink href={listHref({ tab: result.tab })} className={buttonClass('secondary')}>
                          {t('seeAll')}
                        </ListLink>
                      )}
                    </EmptyState>
                  </div>
                )}
              </ListResults>
            </div>

            {(query.page > 1 || query.page < result.pages) && (
              <nav aria-label={t('pages')} className="flex flex-wrap justify-center gap-3">
                {query.page > 1 && (
                  <ListLink rel="prev" href={listHref({ ...query, tab: result.tab, page: query.page - 1 })} className={pill}>
                    {t('newer')}
                  </ListLink>
                )}
                {query.page < result.pages && (
                  <ListLink rel="next" href={listHref({ ...query, tab: result.tab, page: query.page + 1 })} className={pill}>
                    {t('older')}
                  </ListLink>
                )}
              </nav>
            )}
          </div>

          {tags.length > 0 && (
            <aside aria-labelledby="hot-tags" className="flex flex-col gap-3 max-md:mt-4 md:max-w-70 md:grow md:basis-60">
              <h2 id="hot-tags" className="text-title">
                {t('hotTags')}
              </h2>
              <ul className="flex flex-wrap gap-2">
                {tags.map(({ tag, count }) => (
                  <li key={tag}>
                    <ListLink
                      href={listHref({ tab: result.tab, tag })}
                      aria-current={query.tag && tag.toLowerCase() === query.tag.toLowerCase() ? 'page' : undefined}
                      className="group flex items-center gap-1.5 rounded-pill bg-surface px-3 py-1 text-meta text-ink-2 hover:text-ink aria-[current=page]:bg-ink aria-[current=page]:text-bg"
                    >
                      #{tag}
                      <span className="text-small text-ink-4 group-aria-[current=page]:text-bg">{t('tagCount', { count })}</span>
                    </ListLink>
                  </li>
                ))}
              </ul>
            </aside>
          )}
        </div>
      </main>
    </ListNavigationProvider>
  )
}
