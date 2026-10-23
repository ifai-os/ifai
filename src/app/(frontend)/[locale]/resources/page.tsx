import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { setRequestLocale } from 'next-intl/server'

import { isLocale } from '@/i18n/config'
import { SkillsDirectory } from '@/modules/resources/public/components/skills-directory'
import { readSkillListParams, type SearchParams } from '@/modules/resources/public/list-params'
import { skillsListMetadata } from '@/modules/resources/public/metadata'

type Props = {
  params: Promise<{ locale: string }>
  searchParams: Promise<SearchParams>
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { locale } = await params
  const list = readSkillListParams(await searchParams)
  if (!isLocale(locale) || !list.page) return {}
  return skillsListMetadata(locale, { ...list, page: list.page })
}

export default async function ResourcesPage({ params, searchParams }: Props) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  setRequestLocale(locale)
  const list = readSkillListParams(await searchParams)
  if (!list.page) notFound()

  return <SkillsDirectory locale={locale} params={{ ...list, page: list.page }} />
}
