import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { setRequestLocale } from 'next-intl/server'

import { isLocale } from '@/i18n/config'
import { auth } from '@/lib/auth/auth'
import { authProviders } from '@/lib/auth/providers'
import { getDb } from '@/lib/db/drizzle'
import { getCategories } from '@/modules/apps/data'
import type { SearchParams } from '@/modules/apps/list-params'
import { submitMetadata } from '@/modules/apps/metadata'
import { AppSubmit } from '@/modules/apps/submissions/components/app-submit'
import { mySubmissions } from '@/modules/apps/submissions/data'
import { nameFromQuery } from '@/modules/apps/submissions/rules'

type Props = {
  params: Promise<{ locale: string }>
  searchParams: Promise<SearchParams>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params
  if (!isLocale(locale)) return {}
  return submitMetadata(locale)
}

// The form and「我的提交」are the signed-in member's, so rendered on every request.
export default async function AppSubmitPage({ params, searchParams }: Props) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  setRequestLocale(locale)
  const [session, query, { categories }] = await Promise.all([
    auth.api.getSession({ headers: await headers() }),
    searchParams,
    getCategories(locale),
  ])
  const member = session
    ? { email: session.user.email, submissions: await mySubmissions((await getDb()).payload, session.user.id) }
    : null

  return (
    <AppSubmit
      member={member}
      signIn={authProviders()}
      categories={categories.map(({ id, name }) => ({ id, name }))}
      name={nameFromQuery(query.name)}
    />
  )
}
