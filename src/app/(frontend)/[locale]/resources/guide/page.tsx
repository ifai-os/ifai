import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { setRequestLocale } from 'next-intl/server'

import { isLocale } from '@/i18n/config'
import { SkillsGuide } from '@/modules/resources/public/components/skills-guide'
import { getGuideHosts } from '@/modules/resources/public/data'
import { guideMetadata } from '@/modules/resources/public/metadata'

type Props = {
  params: Promise<{ locale: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params
  if (!isLocale(locale)) return {}
  return guideMetadata(locale)
}

export default async function SkillsGuidePage({ params }: Props) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  setRequestLocale(locale)

  return <SkillsGuide hosts={await getGuideHosts(locale)} />
}
