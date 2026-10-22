import Image from 'next/image'
import { useFormatter, useTranslations } from 'next-intl'
import type { ReactNode } from 'react'

import { buttonClass } from '@/components/button'
import { Icon } from '@/components/icon'
import { Link } from '@/i18n/navigation'

import type { AppDetail } from '../data'
import { listHref } from '../list-params'
import { AppTile } from './app-tile'
import { ShareButton } from './share-button'

type FactKey = 'developer' | 'pricing' | 'platforms' | 'listedAt'

// The phone's bottom bar uses taller buttons than `buttonClass`.
const barButton =
  'inline-flex h-12 items-center justify-center gap-1.5 rounded-btn px-4 text-body font-medium whitespace-nowrap transition-colors'

/** An app's page: header and facts, then what it is, features, FAQ and alternatives. */
export function AppDetailView({ app }: { app: AppDetail }) {
  const t = useTranslations('apps')
  const format = useFormatter()

  const facts: { key: FactKey; value: string }[] = []
  if (app.developer) facts.push({ key: 'developer', value: app.developer })
  if (app.pricing) facts.push({ key: 'pricing', value: t(`pricing.${app.pricing}`) })
  if (app.platforms.length > 0) {
    facts.push({ key: 'platforms', value: app.platforms.map((platform) => t(`platforms.${platform}`)).join(' · ') })
  }
  if (app.listedAt) {
    facts.push({ key: 'listedAt', value: format.dateTime(new Date(app.listedAt), { year: 'numeric', month: 'long' }) })
  }

  return (
    <>
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
                </p>
              </div>
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
                <OpenSiteLink href={app.website} className={buttonClass('primary')}>
                  <Icon name="external" size={15} strokeWidth={2} />
                  {t('openSite')}
                </OpenSiteLink>
              )}
              <ShareButton title={app.name} className={buttonClass('secondary')} />
            </div>
          </div>

          {app.screenshot && (
            <figure className="hidden min-w-0 flex-[1_1_380px] flex-col rounded-hero border border-surface-2 bg-surface p-4 md:flex md:max-w-130">
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
            </figure>
          )}
        </section>

        <div className="flex w-full max-w-190 flex-col gap-8 md:gap-10">
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

          {app.faqs && (
            <Section id="faqs" title={t('faqs')}>
              <div lang={app.faqs.lang} className="flex flex-col border-t border-surface-2">
                {app.faqs.value.map((faq, index) => (
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
          )}

          {app.alternatives.length > 0 && (
            <Section id="alternatives" title={t('alternatives')}>
              <ul className="-mx-4 flex gap-2.5 overflow-x-auto px-4 pb-1 md:mx-0 md:grid md:grid-cols-[repeat(auto-fill,minmax(220px,1fr))] md:gap-3 md:overflow-visible md:px-0 md:pb-0">
                {app.alternatives.map((alternative) => (
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
                    </Link>
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </div>
      </main>

      {/* Phones: the two actions stay in reach while reading. */}
      <div className="sticky bottom-0 z-10 flex gap-2.5 border-t border-line bg-bg px-4 pt-2.5 pb-3.5 md:hidden">
        <ShareButton title={app.name} className={`${barButton} border border-line bg-bg text-ink hover:border-ink-4`} />
        {app.website && (
          <OpenSiteLink href={app.website} className={`${barButton} flex-1 bg-ink text-white hover:bg-ink-2`}>
            {t('openSite')}
            <Icon name="external" size={16} />
          </OpenSiteLink>
        )}
      </div>
    </>
  )
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3 md:gap-4">
      <h2 id={id} className="text-h3 font-semibold md:text-h2">
        {title}
      </h2>
      {children}
    </section>
  )
}

/** The app's own website, in a new tab. Keeps the referrer, so the site can see visits came from here. */
function OpenSiteLink({ href, className, children }: { href: string; className: string; children: ReactNode }) {
  const t = useTranslations('apps')
  return (
    <a href={href} target="_blank" rel="noopener" className={className}>
      {children}
      <span className="sr-only">{t('newTab')}</span>
    </a>
  )
}
