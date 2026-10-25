import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'

import { isLocale } from '@/i18n/config'
import { auth } from '@/lib/auth/auth'
import { authProviders } from '@/lib/auth/providers'
import { getDb } from '@/lib/db/drizzle'
import { alternatesFor } from '@/lib/seo'
import { MyArticles } from '@/modules/recommend/components/my-articles'
import { recommendLaunched } from '@/modules/recommend/rules'
import { myArticles } from '@/modules/recommend/write'

type Props = { params: Promise<{ locale: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params
  if (!isLocale(locale) || !recommendLaunched()) return {}
  const t = await getTranslations({ locale, namespace: 'recommend.mine' })
  return { title: t('title'), alternates: alternatesFor('/me/articles', locale), robots: { index: false } }
}

// Each member's own list, so rendered on every request.
export default async function MyArticlesPage({ params }: Props) {
  const { locale } = await params
  if (!isLocale(locale) || !recommendLaunched()) notFound()
  setRequestLocale(locale)
  const session = await auth.api.getSession({ headers: await headers() })
  const articles = session ? await getDb().then(({ payload }) => myArticles(payload, session.user.id)) : null
  return <MyArticles articles={articles} signIn={authProviders()} />
}
