import { useTranslations } from 'next-intl'

import { buttonClass } from '@/components/button'
import { EmptyState } from '@/components/states/empty-state'
import { ListLink, ListResults } from '@/components/states/list-navigation'

import type { StoryCategory } from '../../categories'
import type { CategoryPage } from '../story-item'
import { listHref } from '../list-params'
import { CategoryArt } from './category-art'
import { CategoryMeta } from './category-meta'
import { CategoryNav } from './category-nav'
import { StoryCardsSkeleton } from './daily-skeletons'
import { pageEnd, pagePill, StoryCard } from './story-card'

/**
 * Each category's banner colours (「日报分类底图」board): its tile, the tile's ink for the text, the
 * dots and the art, and the fade behind the text. Whole class names, so Tailwind finds them.
 * 「大模型」is the dark tile, so its title is white.
 */
const looks: Record<StoryCategory, { tile: string; ink: string; title: string; dots: string; fade: string }> = {
  llm: { tile: 'bg-tile-1', ink: 'text-tile-1-ink', title: 'text-white', dots: 'opacity-14', fade: 'from-tile-1 to-tile-1/0' },
  tools: { tile: 'bg-tile-2', ink: 'text-tile-2-ink', title: 'text-ink', dots: 'opacity-20', fade: 'from-tile-2 to-tile-2/0' },
  aigc: { tile: 'bg-tile-5', ink: 'text-tile-5-ink', title: 'text-ink', dots: 'opacity-20', fade: 'from-tile-5 to-tile-5/0' },
  open: { tile: 'bg-tile-4', ink: 'text-tile-4-ink', title: 'text-ink', dots: 'opacity-20', fade: 'from-tile-4 to-tile-4/0' },
  industry: { tile: 'bg-tile-3', ink: 'text-tile-3-ink', title: 'text-ink', dots: 'opacity-20', fade: 'from-tile-3 to-tile-3/0' },
  research: { tile: 'bg-tile-7', ink: 'text-tile-7-ink', title: 'text-ink', dots: 'opacity-20', fade: 'from-tile-7 to-tile-7/0' },
  robotics: { tile: 'bg-tile-6', ink: 'text-tile-6-ink', title: 'text-ink', dots: 'opacity-20', fade: 'from-tile-6 to-tile-6/0' },
}

/**
 * A category page (「IFAI 日报 · 分类页」and「日报分类底图」boards; docs/specs/daily.md「分类与分类页」):
 * the banner with #name, what the category covers and its numbers, then every category as pills
 * and the stories as cards under their times, newest first, 20 to a page. Inside
 * `ListNavigationProvider` (the route page), other categories and pages load in place.
 */
export function CategoryPageView({ page, serverToday }: { page: CategoryPage; serverToday: string }) {
  const t = useTranslations('daily')
  const names = useTranslations('categories')
  const about = useTranslations('categoryAbout')
  const { category } = page
  const look = looks[category]

  return (
    <main id="main" className="flex w-full flex-1 flex-col bg-surface">
      <section
        aria-labelledby="category-title"
        className={`relative flex min-h-50 flex-col justify-center overflow-hidden px-4 py-6 md:min-h-60 ${look.tile}`}
      >
        <div
          aria-hidden="true"
          className={`absolute inset-0 bg-[radial-gradient(circle_at_12px_12px,currentColor_1.3px,transparent_1.8px)] bg-size-[24px_24px] ${look.ink} ${look.dots}`}
        />
        <CategoryArt category={category} className={look.ink} />
        <div className="relative mx-auto w-full max-w-240">
          {/* Narrow on phones so the art's last 150 px still show; the fade behind the text hides the dots and art under it. */}
          <div className="relative z-0 flex max-w-52.5 flex-col gap-2 md:max-w-115">
            <div
              aria-hidden="true"
              className={`absolute -inset-y-75 -right-10 -left-750 -z-10 bg-linear-to-r from-[calc(100%-40px)] md:-right-20 md:from-[calc(100%-180px)] ${look.fade}`}
            />
            <h1 id="category-title" className={`text-display-phone wrap-anywhere md:text-display ${look.title}`}>
              <span aria-hidden="true" className="text-accent-ink">
                #
              </span>
              {names(category)}
            </h1>
            <p className={`text-ui md:text-body ${look.ink}`}>{about(category)}</p>
            {page.latest && (
              <CategoryMeta week={page.week} latest={page.latest} serverToday={serverToday} className={`text-meta ${look.ink}`} />
            )}
          </div>
        </div>
      </section>

      <div className="mx-auto flex w-full max-w-240 flex-col gap-7 px-4 pt-6 pb-16 md:pb-30">
        <CategoryNav current={category} large />
        {page.page > 1 && (
          <ListLink rel="prev" href={listHref({ category, page: page.page - 1 })} className={`${pagePill} self-center`}>
            {t('loadNewer')}
          </ListLink>
        )}
        <ListResults skeleton={<StoryCardsSkeleton count={Math.min(Math.max(page.stories.length, 3), 6)} />}>
          {page.stories.length > 0 ? (
            <ol className="flex flex-col gap-7">
              {page.stories.map((story) => (
                <StoryCard key={story.id} story={story} serverToday={serverToday} />
              ))}
            </ol>
          ) : (
            <EmptyState title={t('emptyCategoryTitle')} body={t('emptyCategoryBody')}>
              <ListLink href={listHref()} className={buttonClass('secondary')}>
                {t('allStories')}
              </ListLink>
            </EmptyState>
          )}
        </ListResults>
        {page.stories.length > 0 && (
          <nav aria-label={t('pages')} className="flex justify-center pt-1">
            {page.page < page.pages ? (
              <ListLink rel="next" href={listHref({ category, page: page.page + 1 })} className={pagePill}>
                {t('loadEarlier')}
              </ListLink>
            ) : (
              <p className={pageEnd}>{t('noEarlier')}</p>
            )}
          </nav>
        )}
      </div>
    </main>
  )
}
