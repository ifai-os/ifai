import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'

import { isLocale } from '@/i18n/config'
import { JsonLd } from '@/lib/structured-data'
import { EntryView } from '@/modules/wiki/components/entry-view'
import { getEntry } from '@/modules/wiki/data'
import { wikiLaunched } from '@/modules/wiki/links'
import { entryMetadata } from '@/modules/wiki/metadata'
import { entryJsonLd } from '@/modules/wiki/structured-data'

type Props = { params: Promise<{ locale: string; slug: string }> }

// None at build time: each entry's page is rendered on its first visit, then kept until an entry changes.
export function generateStaticParams() {
  return []
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params
  if (!isLocale(locale) || !wikiLaunched()) return {}
  return entryMetadata(slug, locale)
}

export default async function WikiEntryPage({ params }: Props) {
  const { locale, slug } = await params
  if (!isLocale(locale) || !wikiLaunched()) notFound()
  setRequestLocale(locale)
  const entry = await getEntry(slug, locale)
  if (!entry) notFound()
  const t = await getTranslations()

  return (
    <>
      <JsonLd data={entryJsonLd(entry, locale, { home: t('metadata.title'), wiki: t('nav.wiki') })} />
      <EntryView entry={entry} />
    </>
  )
}
