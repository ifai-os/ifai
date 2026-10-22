import type { Metadata, Viewport } from 'next'
import { notFound } from 'next/navigation'
import { hasLocale, NextIntlClientProvider } from 'next-intl'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import type { ReactNode } from 'react'

import { SiteFooter } from '@/components/site-footer'
import { SiteHeader } from '@/components/site-header'
import { NetworkNotice } from '@/components/states/network-notice'
import { ogLocales } from '@/i18n/config'
import { routing } from '@/i18n/routing'
import { siteUrl } from '@/lib/site-url'

import '../globals.css'

type Props = {
  children: ReactNode
  params: Promise<{ locale: string }>
}

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }))
}

export async function generateMetadata({ params }: Omit<Props, 'children'>): Promise<Metadata> {
  const { locale } = await params
  if (!hasLocale(routing.locales, locale)) return {}
  const t = await getTranslations({ locale, namespace: 'metadata' })
  const ogImage = locale.startsWith('zh') ? '/og-image-zh.png' : '/og-image.png'

  return {
    metadataBase: new URL(siteUrl()),
    title: { default: t('title'), template: t('titleTemplate') },
    description: t('description'),
    applicationName: 'IFAI',
    openGraph: {
      type: 'website',
      siteName: 'IFAI',
      locale: ogLocales[locale],
      alternateLocale: routing.locales.filter((item) => item !== locale).map((item) => ogLocales[item]),
      images: [{ url: ogImage, width: 1200, height: 630, alt: 'IFAI' }],
    },
    twitter: { card: 'summary_large_image', images: [ogImage] },
  }
}

export const viewport: Viewport = {
  themeColor: '#FFFFFF',
}

export default async function LocaleLayout({ children, params }: Props) {
  const { locale } = await params
  if (!hasLocale(routing.locales, locale)) notFound()
  setRequestLocale(locale)
  const t = await getTranslations('header')

  return (
    <html lang={locale}>
      <body className="flex min-h-dvh flex-col bg-bg text-ink antialiased">
        <NextIntlClientProvider>
          <a
            href="#main"
            className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-4 focus:z-50 focus:rounded-btn focus:bg-ink focus:px-4 focus:py-2 focus:text-white"
          >
            {t('skip')}
          </a>
          <SiteHeader />
          <div className="flex flex-1 flex-col">{children}</div>
          <SiteFooter />
          <NetworkNotice />
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
