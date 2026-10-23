import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'

import { AccountPage } from '@/components/account/account-page'
import { isLocale } from '@/i18n/config'
import { auth } from '@/lib/auth/auth'
import { authProviders } from '@/lib/auth/providers'
import { alternatesFor } from '@/lib/seo'

type Props = { params: Promise<{ locale: string }>; searchParams: Promise<{ deleted?: string | string[] }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params
  if (!isLocale(locale)) return {}
  const t = await getTranslations({ locale, namespace: 'account' })
  return {
    title: t('title'),
    description: t('description'),
    alternates: alternatesFor('/me/account', locale),
    robots: { index: false },
  }
}

// The member's own account, so rendered on every request.
export default async function AccountRoute({ params, searchParams }: Props) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  setRequestLocale(locale)
  const session = await auth.api.getSession({ headers: await headers() })
  const { deleted } = await searchParams

  return <AccountPage email={session?.user.email ?? null} deleted={deleted === '1'} signIn={authProviders()} />
}
