import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'

import { isLocale } from '@/i18n/config'
import { JsonLd } from '@/lib/structured-data'
import { StoryDetailView } from '@/modules/daily/public/components/story-detail'
import { getStory } from '@/modules/daily/public/data'
import { storyMetadata } from '@/modules/daily/public/metadata'
import { storyJsonLd } from '@/modules/daily/public/structured-data'

type Props = { params: Promise<{ locale: string; slug: string }> }

// None at build time: each story's page is rendered on its first visit, then kept until the editor publishes a change.
export function generateStaticParams() {
  return []
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params
  if (!isLocale(locale)) return {}
  return storyMetadata(slug, locale)
}

export default async function StoryPage({ params }: Props) {
  const { locale, slug } = await params
  if (!isLocale(locale)) notFound()
  setRequestLocale(locale)
  const story = await getStory(slug, locale)
  if (!story) notFound()
  const t = await getTranslations()

  return (
    <>
      <JsonLd
        data={storyJsonLd(story, locale, {
          home: t('metadata.title'),
          daily: t('nav.daily'),
          category: t(`categories.${story.category}`),
        })}
      />
      <StoryDetailView story={story} />
    </>
  )
}
