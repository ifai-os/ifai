import Image from 'next/image'
import { useFormatter, useLocale, useTranslations } from 'next-intl'
import type { ReactNode } from 'react'

import { buttonBase, buttonClass } from '@/components/button'
import { Icon } from '@/components/icon'
import { LocalTime } from '@/components/local-time'
import { ShareButton } from '@/components/share-button'
import { getPathname, Link } from '@/i18n/navigation'
import type { AuthProviders } from '@/lib/auth/providers'
import { SaveButton, SaveCount } from '@/modules/saves/components/save-button'
import { SaveProvider } from '@/modules/saves/components/save-provider'

import type { AppDetail } from '../data'
import { listHref } from '../list-params'
import { ReportButton } from '../reports/components/report-button'
import { ReviewsProvider } from '../reviews/components/reviews-provider'
import { ReviewsSection, ReviewSummary } from '../reviews/components/reviews-section'
import { showTrancoRank } from '../settings'
import { HeatPlaces, HeatSection, HeatStats } from './app-heat'
import { AppTile } from './app-tile'
import { DetailTabs, type DetailPart, type DetailTab, type DetailTabId } from './detail-tabs'

type FactKey = 'developer' | 'pricing' | 'platforms' | 'listedAt'

// The phone's bottom bar uses taller buttons than `buttonClass`.
const barButton =
  'inline-flex h-12 items-center justify-center gap-1.5 rounded-btn px-4 text-body font-medium whitespace-nowrap transition-colors'
// Outlined like a secondary button; the save button colors its own text.
const outline = 'border border-line bg-bg hover:border-ink-4'

const tabOrder: DetailTabId[] = ['overview', 'heat', 'reviews', 'alternatives']
/** The headings in each tab, so an address like #faqs opens the right one. */
const tabAnchors: Record<DetailTabId, string[]> = {
  overview: ['about', 'features', 'faqs'],
  heat: ['heat', 'mentions'],
  reviews: ['reviews'],
  alternatives: ['alternatives'],
}

type AppDetailViewProps = {
  app: AppDetail
  /** The sign-in methods, for the dialog a visitor gets on pressing save or「写评价」. */
  signIn: AuthProviders
}

/**
 * An app's page: header and facts, its heat figures, then what it is, features, heat with the
 * Daily stories about it, FAQ, reviews and alternatives, and「信息有误？」. Wider screens put
 * these in four tabs, with the app's places on the lists beside them (docs/specs/apps.md「第 6 步」).
 */
export function AppDetailView({ app, signIn }: AppDetailViewProps) {
  const t = useTranslations('apps')
  const reviews = useTranslations('reviews')
  const format = useFormatter()
  const showSiteRank = showTrancoRank()

  const facts: { key: FactKey; value: string }[] = []
  if (app.developer) facts.push({ key: 'developer', value: app.developer })
  if (app.pricing) facts.push({ key: 'pricing', value: t(`pricing.${app.pricing}`) })
  if (app.platforms.length > 0) {
    facts.push({ key: 'platforms', value: app.platforms.map((platform) => t(`platforms.${platform}`)).join(' · ') })
  }
  if (app.listedAt) {
    facts.push({ key: 'listedAt', value: format.dateTime(new Date(app.listedAt), { year: 'numeric', month: 'long' }) })
  }

  // On phones the parts follow one another in this order; wider screens put them in tabs.
  const parts: DetailPart[] = []
  if (app.description || app.features) parts.push({ tab: 'overview', content: <Overview app={app} /> })
  if (app.heat || app.mentions.length > 0) parts.push({ tab: 'heat', content: <HeatSection app={app} showSiteRank={showSiteRank} /> })
  if (app.faqs) parts.push({ tab: 'overview', content: <Faqs faqs={app.faqs} /> })
  parts.push({ tab: 'reviews', content: <ReviewsSection /> })
  if (app.alternatives.length > 0) parts.push({ tab: 'alternatives', content: <Alternatives alternatives={app.alternatives} /> })

  const labels: Record<DetailTabId, string> = {
    overview: t('tabs.overview'),
    heat: t('heat'),
    reviews: reviews('title'),
    alternatives: t('alternatives'),
  }
  const tabs: DetailTab[] = tabOrder
    .filter((id) => parts.some((part) => part.tab === id))
    .map((id) => ({ id, label: labels[id], anchors: tabAnchors[id] }))

  const shareLabels = { share: t('share'), copied: t('copied') }
  const reportApp = { id: app.id, name: app.name }
  const reportLink = 'text-ink-4 hover:text-ink hover:underline'

  return (
    <SaveProvider target={{ type: 'app', id: app.id }} signIn={signIn}>
      <ReviewsProvider app={{ id: app.id, name: app.name }} signIn={signIn}>
        <main id="main" className="mx-auto flex w-full max-w-content flex-col gap-7 px-4 pt-5 pb-12 md:pb-24">
          <nav aria-label={t('breadcrumb')} className="text-meta text-ink-4">
            <ol className="flex flex-wrap items-center gap-2">
              <li className="flex items-center gap-2">
                <Link href="/apps" className="hover:text-ink">
                  {t('title')}
                </Link>
                <span aria-hidden="true">/</span>
              </li>
              {app.category && (
                <li className="flex items-center gap-2">
                  <Link href={listHref({ category: app.category.slug })} className="hover:text-ink">
                    {app.category.name}
                  </Link>
                  <span aria-hidden="true">/</span>
                </li>
              )}
              <li aria-current="page" className="min-w-0 truncate text-ink">
                {app.name}
              </li>
            </ol>
          </nav>

          <section className="flex flex-wrap items-stretch gap-x-10 gap-y-7">
            <div className="flex max-w-190 min-w-0 flex-[999_1_460px] flex-col gap-3.5 md:gap-4">
              <div className="flex items-center gap-3.5 md:gap-4">
                <AppTile name={app.name} slug={app.slug} logo={app.logo} size="2xl" />
                <div className="flex min-w-0 flex-col gap-1 md:gap-1.5">
                  <h1 className="text-h2 wrap-anywhere md:text-h1">{app.name}</h1>
                  <p className="text-meta text-ink-4">
                    {app.developer}
                    {app.developer && app.category && ' · '}
                    {app.category && (
                      <Link href={listHref({ category: app.category.slug })} className="hover:text-ink">
                        {app.category.name}
                      </Link>
                    )}
                    {/* Phones show the count on the save button in the bottom bar, and the reviews further down. */}
                    {(app.developer || app.category) && <SaveCount className="hidden md:inline" />}
                    {(app.developer || app.category) && <ReviewSummary className="hidden md:inline" />}
                  </p>
                </div>
                {/* Phones share from here; the bottom bar keeps save and the website. */}
                <ShareButton
                  title={app.name}
                  iconOnly
                  className="ml-auto flex size-11 flex-none items-center justify-center text-ink md:hidden"
                  labels={shareLabels}
                />
              </div>

              {app.tagline && (
                <p lang={app.tagline.lang} className="max-w-160 text-body text-ink-2">
                  {app.tagline.value}
                </p>
              )}

              {facts.length > 0 && (
                <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-tile border border-surface-2 bg-surface-2 md:flex md:flex-col md:gap-0 md:overflow-visible md:rounded-none md:border-x-0 md:border-b-0 md:bg-transparent">
                  {facts.map((fact, index) => (
                    <div
                      key={fact.key}
                      className={`flex flex-col gap-0.5 bg-bg px-3.5 py-3 md:grid md:grid-cols-[96px_minmax(0,1fr)] md:gap-4 md:border-b md:border-surface-2 md:px-0 md:py-2.5 ${
                        facts.length % 2 === 1 && index === facts.length - 1 ? 'col-span-2' : ''
                      }`}
                    >
                      <dt className="text-small text-ink-4 md:text-meta">{t(`facts.${fact.key}`)}</dt>
                      <dd className="text-ui font-medium md:text-meta md:font-normal">{fact.value}</dd>
                    </div>
                  ))}
                </dl>
              )}

              {app.tags && (
                <ul lang={app.tags.lang} aria-label={t('tags')} className="flex flex-wrap gap-2">
                  {app.tags.value.map((tag) => (
                    <li key={tag}>
                      <Link
                        href={listHref({ q: tag })}
                        rel="nofollow"
                        className="flex h-6.5 items-center rounded-pill border border-surface-2 bg-surface px-2.5 text-small text-ink-2 hover:border-line hover:text-ink"
                      >
                        {tag}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}

              <div className="hidden flex-wrap gap-2 pt-1 md:flex">
                {app.website && (
                  <OpenSiteLink slug={app.slug} className={buttonClass('primary')}>
                    <Icon name="external" size={15} strokeWidth={2} />
                    {t('openSite')}
                  </OpenSiteLink>
                )}
                <SaveButton className={`${buttonBase} ${outline}`} />
                <ShareButton title={app.name} className={buttonClass('secondary')} labels={shareLabels} />
              </div>
            </div>

            {app.screenshot && (
              <figure className="hidden min-w-0 flex-[1_1_380px] flex-col gap-3 rounded-hero border border-surface-2 bg-surface p-4 md:flex md:max-w-130">
                <div className="overflow-hidden rounded-tile border border-line bg-bg">
                  <div aria-hidden="true" className="flex h-7 items-center gap-1.5 border-b border-surface-2 px-3">
                    <span className="size-2 rounded-pill bg-line" />
                    <span className="size-2 rounded-pill bg-line" />
                    <span className="size-2 rounded-pill bg-line" />
                    <span className="ml-3 h-3.5 flex-1 rounded-pill bg-surface" />
                  </div>
                  <Image
                    src={app.screenshot.url}
                    alt={t('screenshotAlt', { name: app.name })}
                    width={app.screenshot.width ?? 1200}
                    height={app.screenshot.height ?? 630}
                    unoptimized
                    className="block h-auto w-full"
                  />
                </div>
                {/* Desktop's way to「信息有误？」; phones and pages without an image have it at the foot. */}
                <figcaption className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-small text-ink-4">
                  <span>{app.screenshotUpdatedAt && t.rich('imageUpdated', { time: () => <LocalTime iso={app.screenshotUpdatedAt as string} style="date" /> })}</span>
                  <ReportButton app={reportApp} className={reportLink} />
                </figcaption>
              </figure>
            )}
          </section>

          {app.heat && <HeatStats app={app} heat={app.heat} showSiteRank={showSiteRank} />}

          <div className="flex flex-col gap-x-12 gap-y-8 md:flex-row md:flex-wrap md:items-start">
            <div className="w-full max-w-190 min-w-0 md:w-auto md:flex-[999_1_560px]">
              <DetailTabs label={t('tabs.label')} tabs={tabs} parts={parts} />
            </div>
            {app.heat && (
              <aside aria-labelledby="places" className="hidden min-w-0 md:block md:max-w-side md:flex-[1_1_260px]">
                <HeatPlaces app={app} heat={app.heat} level={2} id="places" />
              </aside>
            )}
          </div>

          <ReportButton
            app={reportApp}
            long
            className={`flex min-h-11 items-center self-center text-meta md:self-start ${reportLink} ${app.screenshot ? 'md:hidden' : ''}`}
          />
        </main>

        {/* Phones: save and the website stay in reach while reading. */}
        <div className="sticky bottom-0 z-10 flex gap-2.5 border-t border-line bg-bg px-4 pt-2.5 pb-3.5 md:hidden">
          <SaveButton withCount className={`${barButton} ${outline} ${app.website ? '' : 'flex-1'}`} />
          {app.website && (
            <OpenSiteLink slug={app.slug} className={`${barButton} flex-1 bg-ink text-white hover:bg-ink-2`}>
              {t('openSite')}
              <Icon name="external" size={16} />
            </OpenSiteLink>
          )}
        </div>
      </ReviewsProvider>
    </SaveProvider>
  )
}

/** 它是什么 and 核心功能: the first part of 概览. */
function Overview({ app }: { app: AppDetail }) {
  const t = useTranslations('apps')
  return (
    <>
      {app.description && (
        <Section id="about" title={t('about')}>
          <p lang={app.description.lang} className="text-body whitespace-pre-line md:text-body-article">
            {app.description.value}
          </p>
        </Section>
      )}
      {app.features && (
        <Section id="features" title={t('features')}>
          <ol
            lang={app.features.lang}
            className="flex flex-col md:grid md:grid-cols-[repeat(auto-fill,minmax(220px,1fr))] md:gap-3"
          >
            {app.features.value.map((feature, index) => (
              <li
                key={feature.id ?? index}
                className="grid grid-cols-[28px_minmax(0,1fr)] gap-2.5 border-t border-surface-2 py-3 md:flex md:flex-col md:rounded-card md:border md:p-4"
              >
                <span
                  aria-hidden="true"
                  className="flex size-7 items-center justify-center rounded-thumb bg-surface text-meta font-semibold text-ink-2 md:hidden"
                >
                  {index + 1}
                </span>
                <span className="flex flex-col gap-0.5 md:gap-1.5">
                  <span className="text-body font-medium">{feature.title}</span>
                  {feature.detail && (
                    <span className="text-ui text-ink-2 md:text-meta md:text-ink-3">{feature.detail}</span>
                  )}
                </span>
              </li>
            ))}
          </ol>
        </Section>
      )}
    </>
  )
}

/** 常见问题, the first one open: the rest of 概览, after the heat on phones. */
function Faqs({ faqs }: { faqs: NonNullable<AppDetail['faqs']> }) {
  const t = useTranslations('apps')
  return (
    <Section id="faqs" title={t('faqs')}>
      <div lang={faqs.lang} className="flex flex-col border-t border-surface-2">
        {faqs.value.map((faq, index) => (
          <details key={faq.id ?? index} open={index === 0} className="group border-b border-surface-2">
            <summary className="flex min-h-13 cursor-pointer list-none items-center justify-between gap-3 py-3 text-body font-medium [&::-webkit-details-marker]:hidden">
              {faq.question}
              <span aria-hidden="true" className="flex-none text-title text-ink-4">
                <span className="group-open:hidden">+</span>
                <span className="hidden group-open:inline">−</span>
              </span>
            </summary>
            <p className="pb-4 text-body whitespace-pre-line text-ink-2">{faq.answer}</p>
          </details>
        ))}
      </div>
    </Section>
  )
}

/** Picked alternatives, or the hottest others in the category, with their heat. */
function Alternatives({ alternatives }: { alternatives: AppDetail['alternatives'] }) {
  const t = useTranslations('apps')
  const card = useTranslations('card')
  return (
    <Section id="alternatives" title={t('alternatives')} named>
      <ul className="-mx-4 flex gap-2.5 overflow-x-auto px-4 pb-1 md:mx-0 md:grid md:grid-cols-[repeat(auto-fill,minmax(220px,1fr))] md:gap-3 md:overflow-visible md:px-0 md:pb-0">
        {alternatives.map((alternative) => (
          <li key={alternative.id} className="flex w-34 flex-none md:w-auto">
            <Link
              href={`/apps/${alternative.slug}`}
              className="group flex w-full flex-col gap-2 rounded-card border border-surface-2 p-3.5 md:gap-2.5 md:bg-surface md:p-4"
            >
              <span className="flex flex-col gap-2 md:flex-row md:items-center md:gap-2.5">
                <AppTile name={alternative.name} slug={alternative.slug} logo={alternative.logo} size="md" />
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate text-body font-semibold group-hover:text-accent md:font-medium">
                    {alternative.name}
                  </span>
                  <span className="hidden text-small text-ink-4 md:block">
                    {[alternative.category?.name, alternative.pricing && t(`pricing.${alternative.pricing}`)]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </span>
              </span>
              {alternative.tagline && (
                <span
                  lang={alternative.tagline.lang}
                  className="line-clamp-2 min-h-9 text-small text-ink-2 md:min-h-0 md:text-meta md:text-ink-3"
                >
                  {alternative.tagline.value}
                </span>
              )}
              {alternative.heat && (
                <span className="mt-auto text-small text-ink-4">{card('heat', { value: alternative.heat.heat })}</span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </Section>
  )
}

type SectionProps = {
  id: string
  title: string
  /** Its tab has the same name, so wider screens leave the heading to screen readers. */
  named?: boolean
  children: ReactNode
}

function Section({ id, title, named = false, children }: SectionProps) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3 md:gap-4">
      <h2 id={id} className={`scroll-mt-20 text-h3 font-semibold ${named ? 'md:sr-only' : 'md:text-h2'}`}>
        {title}
      </h2>
      {children}
    </section>
  )
}

/**
 * The app's own website, in a new tab, through the visit route that counts the click toward its
 * heat. A plain link rather than Link, so nothing prefetches it; the referrer is kept, so the
 * site can see visits came from here.
 */
function OpenSiteLink({ slug, className, children }: { slug: string; className: string; children: ReactNode }) {
  const t = useTranslations('apps')
  const locale = useLocale()
  return (
    <a href={getPathname({ href: `/apps/${slug}/visit`, locale })} target="_blank" rel="nofollow noopener" className={className}>
      {children}
      <span className="sr-only">{t('newTab')}</span>
    </a>
  )
}
