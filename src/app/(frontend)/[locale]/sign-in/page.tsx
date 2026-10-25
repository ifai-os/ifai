import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { Suspense } from 'react'

import { SignInForm } from '@/components/auth/sign-in-form'
import { Logo } from '@/components/brand/logo'
import { isLocale } from '@/i18n/config'
import { authProviders } from '@/lib/auth/providers'
import { alternatesFor } from '@/lib/seo'

type Props = { params: Promise<{ locale: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params
  if (!isLocale(locale)) return {}
  const t = await getTranslations({ locale, namespace: 'auth' })
  return {
    title: t('title'),
    alternates: alternatesFor('/sign-in', locale),
    robots: { index: false },
  }
}

export default async function SignInPage({ params }: Props) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  setRequestLocale(locale)
  const t = await getTranslations('auth')

  // The form takes the heading over, to put「登录链接已发送」in its place; the page shows it while the form loads.
  const header = (
    <div className="flex flex-col items-center gap-3 text-center">
      <Logo size={56} eager />
      <h1 className="text-h2">{t('title')}</h1>
      <p className="text-body text-ink-3">{t('subtitle')}</p>
    </div>
  )

  return (
    <main id="main" className="mx-auto flex w-full max-w-[420px] flex-col px-4 pt-16 pb-24">
      <Suspense fallback={header}>
        <SignInForm providers={authProviders()} header={header} />
      </Suspense>
    </main>
  )
}
