import { useLocale, useTranslations } from 'next-intl'
import { Suspense } from 'react'

import { SignInForm } from '@/components/auth/sign-in-form'
import { ButtonLink } from '@/components/button'
import { localizePath, type Locale } from '@/i18n/config'
import type { AuthProviders } from '@/lib/auth/providers'

import { DeleteAccount } from './delete-account'
import { ExportData } from './export-data'

type AccountPageProps = {
  /** The signed-in member's email; null for a visitor, who gets the sign-in form. */
  email: string | null
  /** Just deleted: the account page is where deleting lands. */
  deleted: boolean
  signIn: AuthProviders
}

/**
 * 「账号」(docs/specs/foundation.md「账号页与删除账号」「导出我的数据」): the sign-in email,
 * downloading the member's data and deleting the account.
 */
export function AccountPage({ email, deleted, signIn }: AccountPageProps) {
  const t = useTranslations('account')
  const locale = useLocale() as Locale

  return (
    <main id="main" className="mx-auto flex w-full max-w-content flex-col gap-6 px-4 pt-6 pb-16 md:gap-8 md:pt-10 md:pb-24">
      <h1 className="text-h2 md:text-h1">{t('title')}</h1>

      {email === null ? (
        deleted ? (
          <div className="flex w-full max-w-105 flex-col items-start gap-5">
            <p role="status" className="w-full rounded-card bg-success-soft p-4 text-ui text-success-ink">
              {t('deleted')}
            </p>
            <ButtonLink href="/" variant="secondary">
              {t('home')}
            </ButtonLink>
          </div>
        ) : (
          <div className="flex w-full max-w-105 flex-col gap-5">
            <p className="text-body text-ink-3">{t('signInBody')}</p>
            <Suspense>
              <SignInForm providers={signIn} callbackURL={localizePath(locale, '/me/account')} />
            </Suspense>
          </div>
        )
      ) : (
        <div className="flex w-full max-w-190 flex-col gap-8">
          <dl className="flex flex-col gap-1 border-b border-surface-2 pb-6">
            <dt className="text-meta text-ink-4">{t('email')}</dt>
            <dd className="text-body font-medium break-all">{email}</dd>
          </dl>

          <section aria-labelledby="export-data" className="flex flex-col items-start gap-3 border-b border-surface-2 pb-8">
            <h2 id="export-data" className="text-title font-semibold">
              {t('exportTitle')}
            </h2>
            <p className="text-ui text-ink-3">{t('exportBody')}</p>
            <ExportData />
          </section>

          <section aria-labelledby="delete-account" className="flex flex-col items-start gap-3">
            <h2 id="delete-account" className="text-title font-semibold">
              {t('deleteTitle')}
            </h2>
            <p className="text-ui text-ink-3">{t('deleteBody')}</p>
            <p className="text-ui text-ink-3">{t('deleteKeeps')}</p>
            <DeleteAccount />
          </section>
        </div>
      )}
    </main>
  )
}
