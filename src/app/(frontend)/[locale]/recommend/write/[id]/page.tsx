import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'

import { isLocale } from '@/i18n/config'
import { auth } from '@/lib/auth/auth'
import { authProviders } from '@/lib/auth/providers'
import { getDb } from '@/lib/db/drizzle'
import { WritePage } from '@/modules/recommend/components/write-page'
import { readArticleId, recommendLaunched } from '@/modules/recommend/rules'
import { articleForEditing } from '@/modules/recommend/write'

type Props = { params: Promise<{ locale: string; id: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params
  if (!isLocale(locale) || !recommendLaunched()) return {}
  const t = await getTranslations({ locale, namespace: 'recommend.write' })
  return { title: t('editTitle'), robots: { index: false } }
}

// One of the member's own articles; anyone else's answers 404. Rendered on every request.
export default async function EditArticlePage({ params }: Props) {
  const { locale, id } = await params
  const articleId = readArticleId(id)
  if (!isLocale(locale) || !articleId || !recommendLaunched()) notFound()
  setRequestLocale(locale)
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return <WritePage signedIn={false} draft={null} signIn={authProviders()} />
  const { payload } = await getDb()
  const draft = await articleForEditing(payload, session.user.id, articleId)
  // A hidden article stays as the site owner left it (rule 17): its author can only delete it.
  if (!draft || draft.status === 'hidden') notFound()
  return <WritePage signedIn draft={draft} signIn={authProviders()} />
}
