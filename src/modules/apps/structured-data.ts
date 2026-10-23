import type { Locale } from '@/i18n/config'
import { absoluteUrl, breadcrumbs, pageUrl, type JsonLdObject } from '@/lib/structured-data'

import type { AppDetail } from './data'
import { listHref } from './list-params'

/**
 * An app's page as a SoftwareApplication, plus its breadcrumb trail (首页 › 应用 › 分类 › 应用).
 * Only what the page shows: no rating, because the review summary is read in the browser and
 * an average needs five reviews; a price only for free and open-source apps.
 */
export function appJsonLd(app: AppDetail, locale: Locale, labels: { home: string; apps: string }): JsonLdObject[] {
  const url = pageUrl(locale, `/apps/${app.slug}`)
  const free = app.pricing === 'free' || app.pricing === 'open-source'
  const software: JsonLdObject = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: app.name,
    url,
    mainEntityOfPage: url,
    sameAs: app.website,
    description: (app.description ?? app.tagline)?.value,
    applicationCategory: app.category?.name,
    image: app.logo ? absoluteUrl(app.logo.url) : undefined,
    screenshot: app.screenshot ? absoluteUrl(app.screenshot.url) : undefined,
    featureList: app.features?.value.map((feature) => feature.title),
    author: app.developer ? { '@type': 'Organization', name: app.developer } : undefined,
    offers: free ? { '@type': 'Offer', price: '0', priceCurrency: 'USD' } : undefined,
  }
  const trail = [
    { name: labels.home, path: '/' as const },
    { name: labels.apps, path: listHref({}) },
    ...(app.category ? [{ name: app.category.name, path: listHref({ category: app.category.slug }) }] : []),
    { name: app.name, path: `/apps/${app.slug}` as const },
  ]
  return [software, breadcrumbs(locale, trail)]
}
