import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'

import { isLocale } from '@/i18n/config'
import { authProviders } from '@/lib/auth/providers'
import { JsonLd } from '@/lib/structured-data'
import { PostPage } from '@/modules/circles/components/post-page'
import { postMetadata } from '@/modules/circles/metadata'
import { circlesLaunched, getCircles, getPostPage } from '@/modules/circles/public'
import { postTitleValues } from '@/modules/circles/rules'
import { postJsonLd } from '@/modules/circles/structured-data'

type Props = { params: Promise<{ locale: string; id: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, id } = await params
  if (!isLocale(locale) || !circlesLaunched()) return {}
  return postMetadata(id, locale)
}

// Rendered on every request: the reader's own reactions, delete buttons and hidden notes are in it.
export default async function CirclePostPage({ params }: Props) {
  const { locale, id } = await params
  if (!isLocale(locale) || !circlesLaunched()) notFound()
  setRequestLocale(locale)
  const page = await getPostPage(id, locale)
  if (!page) notFound()
  const t = await getTranslations()
  const title = t('circles.postTitle', postTitleValues(page.post, page.post.author.name || t('circles.anonymous'), page.circle.name))

  return (
    <>
      {!page.post.hidden && (
        <JsonLd
          data={postJsonLd(page, locale, { home: t('metadata.title'), circles: t('nav.circles'), title, anonymous: t('circles.anonymous') })}
        />
      )}
      <PostPage
        post={page.post}
        circles={await getCircles(locale)}
        comments={page.comments}
        loadedAt={page.loadedAt}
        title={title}
        signIn={authProviders()}
      />
    </>
  )
}
