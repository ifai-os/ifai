import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { setRequestLocale } from 'next-intl/server'

import { isLocale } from '@/i18n/config'
import { SkillDetailView } from '@/modules/resources/public/components/skill-detail'
import { getSkill } from '@/modules/resources/public/data'
import { skillMetadata } from '@/modules/resources/public/metadata'

type Props = { params: Promise<{ locale: string; slug: string }> }

// None at build time: each Skill's page is rendered on its first visit, then kept until a Skill changes.
export function generateStaticParams() {
  return []
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params
  if (!isLocale(locale)) return {}
  return skillMetadata(slug, locale)
}

export default async function SkillPage({ params }: Props) {
  const { locale, slug } = await params
  if (!isLocale(locale)) notFound()
  setRequestLocale(locale)
  const skill = await getSkill(slug, locale)
  if (!skill) notFound()

  return <SkillDetailView skill={skill} pinned={false} />
}
