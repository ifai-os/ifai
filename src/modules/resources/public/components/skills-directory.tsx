import Form from 'next/form'
import { notFound } from 'next/navigation'
import { getFormatter, getTranslations } from 'next-intl/server'

import { ButtonLink } from '@/components/button'
import { EmptyState } from '@/components/states/empty-state'
import { Icon } from '@/components/icon'
import type { Locale } from '@/i18n/config'
import { getPathname, Link } from '@/i18n/navigation'

import { getSkillsOverview, getTag, listSkills } from '../data'
import { guideHref, isFiltered, skillHref, skillSorts, skillsHref, type SkillListParams } from '../list-params'
import { SkillItem } from './skill-item'
import { SkillTile } from './skill-tile'
import { ViewSwitch } from './view-switch'

type SkillsDirectoryProps = { locale: Locale; params: SkillListParams & { page: number } }

const chip = 'flex h-8.5 items-center gap-1.5 rounded-pill border px-3.5 text-meta whitespace-nowrap transition-colors'
const chipOn = 'border-ink bg-ink text-white'
const chipOff = 'border-line bg-bg text-ink-2 hover:border-ink-4'

/**
 * The Skills list (docs/specs/resources.md「页面与路由」, board「IFAI 资源 · Skills」): heading
 * with real counts, 本周精选, 三步用上 Skill, then categories, sorts, filters and search, one page
 * of Skills as a list or a grid, and the hot tags beside it. Every choice lives in the address.
 */
export async function SkillsDirectory({ locale, params }: SkillsDirectoryProps) {
  const t = await getTranslations('resources')
  const categoryName = await getTranslations('skillCategories')
  const format = await getFormatter()
  const [overview, result, tag] = await Promise.all([
    getSkillsOverview(locale),
    listSkills({ ...params, locale }),
    params.tag ? getTag(params.tag, locale) : null,
  ])
  // Past the last page: 404 rather than an empty list under a new address.
  if (params.page > 1 && result.skills.length === 0) notFound()

  const { category, sort, q, author, noKey, certified } = params
  const keep = { category, sort, q, tag: params.tag, author, noKey, certified }
  const featured = overview.featured
  const filtered = isFiltered(keep)
  const totalInView = category ? (overview.categories.find((item) => item.slug === category)?.count ?? 0) : overview.total

  return (
    <main id="main" className="mx-auto flex w-full max-w-content flex-col gap-6 px-4 pt-5 pb-16 md:gap-8 md:pt-8 md:pb-24">
      <section className="flex flex-col gap-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-1.5">
            <h1 className="text-h2 md:text-h1">{t('title')}</h1>
            <p className="max-w-160 text-ui text-ink-3">{t('intro')}</p>
          </div>
          <p className="flex gap-5 text-meta text-ink-4">
            <span>
              <b className="text-title font-semibold text-ink tabular-nums">{format.number(overview.total)}</b> {t('listed')}
            </span>
            <span>
              <b className="text-title font-semibold text-ink tabular-nums">+{format.number(overview.newThisWeek)}</b> {t('newThisWeek')}
            </span>
          </p>
        </div>

        <div className="flex flex-wrap gap-4">
          {featured && (
            <Link
              href={skillHref(featured.slug)}
              className="group flex min-w-0 flex-[2_1_420px] items-center gap-4 rounded-hero bg-night px-6 py-5 text-white"
            >
              <SkillTile name={featured.name.value} slug={featured.slug} size="xl" />
              <span className="flex min-w-0 flex-col gap-1">
                <span className="text-small text-white/80">
                  {t('featured')} · {categoryName(featured.category)}
                </span>
                <span lang={featured.name.lang} className="text-h3 font-semibold group-hover:underline">
                  {featured.name.value}
                </span>
                {featured.tagline && (
                  <span lang={featured.tagline.lang} className="text-meta text-white/80">
                    {featured.tagline.value}
                  </span>
                )}
              </span>
            </Link>
          )}
          <div className="flex min-w-0 flex-[1_1_280px] flex-col gap-4">
            <div className="flex flex-col gap-2.5 rounded-hero border border-surface-2 bg-surface px-6 py-5">
              <h2 className="text-title font-semibold">{t('steps.title')}</h2>
              <ol className="flex flex-col gap-2">
                {(['pick', 'enable', 'ask'] as const).map((step, index) => (
                  <li key={step} className="flex items-center gap-2.5 text-ui text-ink-2">
                    <span aria-hidden="true" className="flex size-6 flex-none items-center justify-center rounded-pill bg-bg text-small font-semibold text-ink">
                      {index + 1}
                    </span>
                    {t(`steps.${step}`)}
                  </li>
                ))}
              </ol>
              <Link href={guideHref} className="flex min-h-8 items-center self-start text-meta font-medium text-link hover:underline">
                {t('steps.guide')} ›
              </Link>
            </div>
            {overview.risers.length > 0 && (
              <section aria-labelledby="risers" className="flex flex-col gap-2 rounded-hero border border-surface-2 bg-surface px-6 py-5">
                <h2 id="risers" className="text-title font-semibold">
                  {t('risers.title')}
                </h2>
                <ol className="flex flex-col">
                  {overview.risers.map(({ skill, rise }, index) => (
                    <li key={skill.id}>
                      <Link href={skillHref(skill.slug)} className="group flex min-h-8 items-center gap-2 text-ui">
                        <span aria-hidden="true" className="w-3 flex-none font-semibold text-accent tabular-nums">
                          {index + 1}
                        </span>
                        <span lang={skill.name.lang} className="min-w-0 flex-1 truncate group-hover:text-accent">
                          {skill.name.value}
                        </span>
                        <span className="flex-none text-meta text-ink-4 tabular-nums">{rise === null ? t('risers.new') : t('risers.rise', { rise })}</span>
                      </Link>
                    </li>
                  ))}
                </ol>
              </section>
            )}
          </div>
        </div>
      </section>

      <div className="flex flex-col gap-6 md:flex-row md:items-start md:gap-10">
        <nav aria-label={t('categoriesLabel')} className="-mx-4 overflow-x-auto px-4 md:mx-0 md:w-47.5 md:flex-none md:overflow-visible md:px-0">
          <ul className="flex gap-2 md:flex-col md:gap-0.5">
            {[{ slug: null, count: overview.total }, ...overview.categories].map((item) => {
              const active = item.slug === category
              return (
                <li key={item.slug ?? 'all'} className="flex-none">
                  <Link
                    href={skillsHref({ ...keep, category: item.slug })}
                    aria-current={active ? 'page' : undefined}
                    className={`flex h-8.5 items-center gap-2.5 rounded-pill border px-3.5 text-meta whitespace-nowrap transition-colors md:h-10 md:rounded-none md:border-0 md:px-0 md:text-body md:font-medium ${
                      active ? 'border-ink bg-ink text-white md:bg-transparent md:text-ink' : 'border-line bg-bg text-ink-2 hover:border-ink-4 md:text-ink-4 md:hover:text-ink'
                    }`}
                  >
                    <span aria-hidden="true" className={`hidden size-1.5 flex-none rounded-pill md:block ${active ? 'bg-accent' : ''}`} />
                    <span className="md:flex-1">{item.slug ? categoryName(item.slug) : t('allCategories')}</span>
                    <span className="hidden text-small font-normal text-ink-4 tabular-nums md:inline">{item.count}</span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>

        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <Form
              action={getPathname({ href: '/resources', locale })}
              role="search"
              className="flex h-11 min-w-0 flex-1 items-center gap-1 rounded-pill border border-surface-2 bg-surface pr-1.5 pl-1 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-link"
            >
              <button type="submit" aria-label={t('searchSubmit')} className="flex size-9 flex-none items-center justify-center rounded-pill text-ink-2 hover:text-ink">
                <Icon name="search" size={18} />
              </button>
              <input
                type="search"
                name="q"
                defaultValue={q}
                maxLength={64}
                enterKeyHint="search"
                aria-label={t('searchLabel')}
                placeholder={t('searchPlaceholder')}
                className="min-w-0 flex-1 bg-transparent text-body outline-none placeholder:text-ink-4 [&::-webkit-search-cancel-button]:appearance-none"
              />
              {category && <input type="hidden" name="category" value={category} />}
              {params.tag && <input type="hidden" name="tag" value={params.tag} />}
              {author && <input type="hidden" name="author" value={author} />}
              {noKey && <input type="hidden" name="nokey" value="1" />}
              {certified && <input type="hidden" name="certified" value="1" />}
              {sort !== 'default' && <input type="hidden" name="sort" value={sort} />}
              {q && (
                <Link
                  href={skillsHref({ ...keep, q: '' })}
                  aria-label={t('clearSearch')}
                  className="flex size-8 flex-none items-center justify-center rounded-pill bg-line text-ink-2 hover:text-ink"
                >
                  <Icon name="close" size={14} strokeWidth={2} />
                </Link>
              )}
            </Form>
            <ul aria-label={t('filtersLabel')} className="flex flex-wrap gap-2">
              <li>
                <Link href={skillsHref({ ...keep, noKey: !noKey })} aria-current={noKey ? 'true' : undefined} className={`${chip} ${noKey ? chipOn : chipOff}`}>
                  {t('filters.noKey')}
                </Link>
              </li>
              <li>
                <Link href={skillsHref({ ...keep, certified: !certified })} aria-current={certified ? 'true' : undefined} className={`${chip} ${certified ? chipOn : chipOff}`}>
                  {t('filters.certified')}
                </Link>
              </li>
            </ul>
          </div>

          {(tag || params.tag || author) && (
            <ul aria-label={t('activeFilters')} className="flex flex-wrap gap-2">
              {params.tag && (
                <li>
                  <Link href={skillsHref({ ...keep, tag: '' })} className={`${chip} ${chipOn}`}>
                    <span lang={tag?.name.lang}>{t('tagFilter', { tag: tag?.name.value ?? params.tag })}</span>
                    <Icon name="close" size={12} strokeWidth={2} />
                    <span className="sr-only">{t('removeFilter')}</span>
                  </Link>
                </li>
              )}
              {author && (
                <li>
                  <Link href={skillsHref({ ...keep, author: '' })} className={`${chip} ${chipOn}`}>
                    {t('authorFilter', { author })}
                    <Icon name="close" size={12} strokeWidth={2} />
                    <span className="sr-only">{t('removeFilter')}</span>
                  </Link>
                </li>
              )}
            </ul>
          )}

          <ViewSwitch
            labels={{ group: t('view.label'), list: t('view.list'), grid: t('view.grid') }}
            toolbar={
              <nav aria-label={t('sortLabel')} className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
                <ul className="flex gap-5">
                  {skillSorts.map((item) => (
                    <li key={item} className="flex-none">
                      <Link
                        href={skillsHref({ ...keep, sort: item })}
                        aria-current={item === sort ? 'true' : undefined}
                        className={`flex h-9 items-center border-b-2 text-ui whitespace-nowrap ${item === sort ? 'border-ink font-medium text-ink' : 'border-transparent text-ink-4 hover:text-ink'}`}
                      >
                        {t(`sorts.${item}`)}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            }
          >
            {result.total > 0 && (
              <p role="status" className="text-meta text-ink-4 wrap-anywhere">
                {q
                  ? t('found', { count: result.total, q })
                  : t('showing', { scope: category ? categoryName(category) : t('allCategories'), count: result.total })}
              </p>
            )}
            {result.skills.length > 0 ? (
              <div className="flex flex-col border-t border-surface-2 group-data-[view=grid]/view:grid group-data-[view=grid]/view:grid-cols-[repeat(auto-fill,minmax(min(260px,100%),1fr))] group-data-[view=grid]/view:gap-4 group-data-[view=grid]/view:border-t-0">
                {result.skills.map((skill) => (
                  <SkillItem key={skill.id} skill={skill} />
                ))}
              </div>
            ) : q || filtered ? (
              <EmptyState icon="search" title={q ? t('noMatchTitle', { q }) : t('noFilterMatchTitle')} body={t('noMatchBody')}>
                <ButtonLink href={skillsHref({ category })} variant="secondary">
                  {t('clearFilters')}
                </ButtonLink>
                {overview.hotTags.slice(0, 4).map((hot) => (
                  <ButtonLink key={hot.slug} href={skillsHref({ tag: hot.slug })} variant="secondary">
                    <span lang={hot.name.lang}>#{hot.name.value}</span>
                  </ButtonLink>
                ))}
              </EmptyState>
            ) : totalInView === 0 && category ? (
              <EmptyState title={t('emptyCategoryTitle')} body={t('emptyCategoryBody')}>
                <ButtonLink href="/resources" variant="secondary">
                  {t('allSkills')}
                </ButtonLink>
              </EmptyState>
            ) : (
              <EmptyState title={t('emptyTitle')} body={t('emptyBody')} />
            )}
          </ViewSwitch>

          {result.pages > 1 && (
            <nav aria-label={t('pages')} className="flex items-center justify-between gap-3 pt-3">
              {result.page > 1 ? (
                <ButtonLink href={skillsHref({ ...keep, page: result.page - 1 })} variant="secondary">
                  ‹ {t('previous')}
                </ButtonLink>
              ) : (
                <span />
              )}
              <span className="text-meta text-ink-4 tabular-nums">{t('pageOf', { page: result.page, pages: result.pages })}</span>
              {result.page < result.pages ? (
                <ButtonLink href={skillsHref({ ...keep, page: result.page + 1 })} variant="secondary">
                  {t('next')} ›
                </ButtonLink>
              ) : (
                <span />
              )}
            </nav>
          )}
        </div>

        {(overview.mostInstalled.length > 0 || overview.hotTags.length > 0) && (
          <aside className="flex flex-col gap-7 md:w-side md:flex-none">
            {overview.mostInstalled.length > 0 && (
              <section aria-labelledby="ranking" className="flex flex-col">
                <div className="flex items-baseline justify-between gap-3 pb-1.5">
                  <h2 id="ranking" className="text-title font-semibold">
                    {t('ranking.title')}
                  </h2>
                  <Link href={skillsHref({ sort: 'installs' })} className="flex-none text-meta text-ink-4 hover:text-ink">
                    {t('ranking.all')}
                  </Link>
                </div>
                <ol className="flex flex-col">
                  {overview.mostInstalled.map((skill, index) => (
                    <li key={skill.id}>
                      <Link href={skillHref(skill.slug)} className="group flex min-h-10 items-center gap-2.5 text-ui">
                        <span aria-hidden="true" className={`w-4 flex-none font-semibold tabular-nums ${index < 3 ? 'text-accent' : 'text-ink-4'}`}>
                          {index + 1}
                        </span>
                        <span lang={skill.name.lang} className="min-w-0 flex-1 truncate group-hover:text-accent">
                          {skill.name.value}
                        </span>
                        <span className="flex-none text-meta text-ink-4 tabular-nums">{format.number(skill.installs, { notation: 'compact' })}</span>
                      </Link>
                    </li>
                  ))}
                </ol>
              </section>
            )}
            {overview.hotTags.length > 0 && (
              <section aria-labelledby="hot-tags" className="flex flex-col gap-3">
                <h2 id="hot-tags" className="text-title font-semibold">
                  {t('hotTags')}
                </h2>
                <ul className="flex flex-wrap gap-2">
                  {overview.hotTags.map((hot) => (
                    <li key={hot.slug}>
                      <Link
                        href={skillsHref({ tag: hot.slug })}
                        aria-current={hot.slug === params.tag ? 'true' : undefined}
                        lang={hot.name.lang}
                        className="flex h-7 items-center rounded-pill border border-surface-2 bg-surface px-3 text-meta text-ink-2 hover:border-line hover:text-ink aria-[current]:border-ink aria-[current]:text-ink"
                      >
                        {hot.name.value}
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
