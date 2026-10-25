import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'

import { isLocale } from '@/i18n/config'
import { JsonLd } from '@/lib/structured-data'
import { TopicView } from '@/modules/wiki/components/topic-view'
import { getTopic, getTopicsWithEntries } from '@/modules/wiki/data'
import { wikiLaunched } from '@/modules/wiki/links'
import { topicMetadata } from '@/modules/wiki/metadata'
import { topicJsonLd } from '@/modules/wiki/structured-data'

type Props = { params: Promise<{ locale: string; slug: string }> }

// The first topic in each language is rendered at build time, every other one on its first visit, then kept until an
// entry or topic changes. Next.js only prefetches a route it rendered at build, so with none the links to topics
// would wait on the server when clicked (docs/specs/wiki.md「缓存」). None before the Wiki is launched: the page is a 404.
export async function generateStaticParams({ params }: { params: { locale: string } }) {
  if (!isLocale(params.locale) || !wikiLaunched()) return []
  return (await getTopicsWithEntries(params.locale)).slice(0, 1).map((topic) => ({ slug: topic.slug }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params
  if (!isLocale(locale) || !wikiLaunched()) return {}
  return topicMetadata(slug, locale)
}

export default async function WikiTopicPage({ params }: Props) {
  const { locale, slug } = await params
  if (!isLocale(locale) || !wikiLaunched()) notFound()
  setRequestLocale(locale)
  const topic = await getTopic(slug, locale)
  if (!topic) notFound()
  const t = await getTranslations()

  return (
    <>
      <JsonLd data={topicJsonLd({ slug: topic.slug, name: topic.name.value }, locale, { home: t('metadata.title'), wiki: t('nav.wiki') })} />
      <TopicView topic={topic} />
    </>
  )
}
