import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { setRequestLocale } from 'next-intl/server'

import { isLocale } from '@/i18n/config'
import { WikiHome } from '@/modules/wiki/components/wiki-home'
import { wikiLaunched } from '@/modules/wiki/links'
import { wikiMetadata } from '@/modules/wiki/metadata'

// 今日条目 turns over once a day (Shanghai time), so the page is rebuilt at least hourly.
export const revalidate = 3600

type Props = { params: Promise<{ locale: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params
  if (!isLocale(locale) || !wikiLaunched()) return {}
  return wikiMetadata(locale)
}

export default async function WikiPage({ params }: Props) {
  const { locale } = await params
  if (!isLocale(locale) || !wikiLaunched()) notFound()
  setRequestLocale(locale)

  return <WikiHome locale={locale} />
}
