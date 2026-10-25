import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'

import { isLocale } from '@/i18n/config'
import { auth } from '@/lib/auth/auth'
import { authProviders } from '@/lib/auth/providers'
import { WritePage } from '@/modules/recommend/components/write-page'
import { recommendLaunched } from '@/modules/recommend/rules'

type Props = { params: Promise<{ locale: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params
  if (!isLocale(locale) || !recommendLaunched()) return {}
  const t = await getTranslations({ locale, namespace: 'recommend.write' })
  return { title: t('newTitle'), robots: { index: false } }
}

// For the signed-in member, so rendered on every request.
export default async function WriteArticlePage({ params }: Props) {
  const { locale } = await params
  if (!isLocale(locale) || !recommendLaunched()) notFound()
  setRequestLocale(locale)
  const session = await auth.api.getSession({ headers: await headers() })
  return <WritePage signedIn={Boolean(session)} draft={null} signIn={authProviders()} />
}
