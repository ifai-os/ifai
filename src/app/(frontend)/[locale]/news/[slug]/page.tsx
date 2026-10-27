import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'

import { isLocale } from '@/i18n/config'
import { authProviders } from '@/lib/auth/providers'
import { JsonLd } from '@/lib/structured-data'
import { StoryDetailView } from '@/modules/daily/public/components/story-detail'
import { getStory, latestStories } from '@/modules/daily/public/data'
import { storyMetadata } from '@/modules/daily/public/metadata'
import { storyJsonLd } from '@/modules/daily/public/structured-data'

type Props = { params: Promise<{ locale: string; slug: string }> }

// The newest story in each language is rendered at build time, every other one on its first visit, then kept until
// the editor publishes a change. Next.js only prefetches a route it rendered at build, so with none the list's links
// to stories would wait on the server when clicked (docs/specs/daily.md「加载状态」).
export async function generateStaticParams({ params }: { params: { locale: string } }) {
  if (!isLocale(params.locale)) return []
  return (await latestStories(params.locale, 1)).map((story) => ({ slug: story.slug }))
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
      <StoryDetailView story={story} signIn={authProviders()} />
    </>
  )
}
