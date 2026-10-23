import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { setRequestLocale } from 'next-intl/server'

import { isLocale } from '@/i18n/config'
import { auth } from '@/lib/auth/auth'
import { authProviders } from '@/lib/auth/providers'
import { submitMetadata } from '@/modules/resources/public/metadata'
import { SkillSubmit } from '@/modules/resources/submit/components/skill-submit'

type Props = {
  params: Promise<{ locale: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params
  if (!isLocale(locale)) return {}
  return submitMetadata(locale)
}

// The form is for the signed-in member, so rendered on every request.
export default async function SkillSubmitPage({ params }: Props) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  setRequestLocale(locale)
  const session = await auth.api.getSession({ headers: await headers() })

  return <SkillSubmit member={session ? { email: session.user.email } : null} signIn={authProviders()} />
}
