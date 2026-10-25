import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'

import { isLocale } from '@/i18n/config'
import { authProviders } from '@/lib/auth/providers'
import { JsonLd } from '@/lib/structured-data'
import { SkillDetailView } from '@/modules/resources/public/components/skill-detail'
import { getHomeSkills, getSkill } from '@/modules/resources/public/data'
import { skillMetadata } from '@/modules/resources/public/metadata'
import { skillJsonLd } from '@/modules/resources/public/structured-data'

type Props = { params: Promise<{ locale: string; slug: string }> }

// The newest Skill in each language is rendered at build time, every other one on its first visit, then kept until
// a Skill changes. Next.js only prefetches a route it rendered at build, so with none the list's links to Skills would
// wait on the server when clicked (docs/specs/resources.md「加载骨架」).
export async function generateStaticParams({ params }: { params: { locale: string } }) {
  if (!isLocale(params.locale)) return []
  return (await getHomeSkills(params.locale)).newest.slice(0, 1).map((skill) => ({ slug: skill.slug }))
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
  const t = await getTranslations()

  return (
    <>
      {skill.status === 'published' && (
        <JsonLd
          data={skillJsonLd(skill, locale, {
            home: t('metadata.title'),
            resources: t('nav.resources'),
            category: t(`skillCategories.${skill.category}`),
          })}
        />
      )}
      <SkillDetailView skill={skill} pinned={false} signIn={authProviders()} />
    </>
  )
}
