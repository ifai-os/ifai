import { useLocale, useTranslations } from 'next-intl'
import { Suspense } from 'react'

import { SignInForm } from '@/components/auth/sign-in-form'
import { localizePath, type Locale } from '@/i18n/config'
import type { AuthProviders } from '@/lib/auth/providers'

import type { ArticleDraft } from '../write'
import { ArticleEditor } from './article-editor'

/** 「写文章」(docs/specs/recommend.md rule 12): the editor for a member, the sign-in form for a visitor. */
export function WritePage({ signedIn, draft, signIn }: { signedIn: boolean; draft: ArticleDraft | null; signIn: AuthProviders }) {
  const t = useTranslations('recommend.write')
  const locale = useLocale() as Locale

  if (signedIn) return <ArticleEditor draft={draft} />

  return (
    <main id="main" className="mx-auto flex w-full max-w-content flex-col gap-6 px-4 pt-6 pb-16 md:gap-8 md:pt-10 md:pb-24">
      <h1 className="text-h2 md:text-h1">{t('newTitle')}</h1>
      <div className="flex w-full max-w-105 flex-col gap-5">
        <p className="text-body text-ink-3">{t('signInBody')}</p>
        <Suspense>
          <SignInForm providers={signIn} callbackURL={localizePath(locale, '/recommend/write')} />
        </Suspense>
      </div>
    </main>
  )
}
