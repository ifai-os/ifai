import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { setRequestLocale } from 'next-intl/server'

import { isLocale } from '@/i18n/config'
import { authProviders } from '@/lib/auth/providers'
import { isValidVersion } from '@/modules/resources/normalize'
import { SkillDetailView } from '@/modules/resources/public/components/skill-detail'
import { getSkill } from '@/modules/resources/public/data'
import { skillMetadata } from '@/modules/resources/public/metadata'

type Props = { params: Promise<{ locale: string; slug: string; version: string }> }

export function generateStaticParams() {
  return []
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug, version } = await params
  if (!isLocale(locale) || !isValidVersion(version)) return {}
  return skillMetadata(slug, locale, version)
}

/**
 * A fixed link to one version (docs/specs/resources.md, rule 2): the same page as the Skill's,
 * for that version, saying whether it is current. A withdrawn version keeps its page and says
 * why; it never redirects to a newer one.
 */
export default async function SkillVersionPage({ params }: Props) {
  const { locale, slug, version } = await params
  if (!isLocale(locale) || !isValidVersion(version)) notFound()
  setRequestLocale(locale)
  const skill = await getSkill(slug, locale, version)
  if (!skill) notFound()

  return <SkillDetailView skill={skill} pinned signIn={authProviders()} />
}
