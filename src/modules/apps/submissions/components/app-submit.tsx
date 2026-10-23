import { getLocale, getTranslations } from 'next-intl/server'
import { Suspense } from 'react'

import { SignInForm } from '@/components/auth/sign-in-form'
import { localizePath, type Locale } from '@/i18n/config'
import { Link } from '@/i18n/navigation'
import type { AuthProviders } from '@/lib/auth/providers'

import { submitHref } from '../../list-params'
import type { MySubmission } from '../data'
import { MySubmissions } from './my-submissions'
import { SubmitForm, type CategoryOption } from './submit-form'

type AppSubmitProps = {
  /** The signed-in member, whose email fills the contact field, with their latest submissions; null for a visitor, who gets the sign-in form. */
  member: { email: string; submissions: MySubmission[] } | null
  signIn: AuthProviders
  categories: CategoryOption[]
  /** From `?name=`: what a search with no match was looking for. */
  name: string
}

/**
 * 提交应用 (docs/specs/apps.md 5e): how a submission is handled, the form (members only) and
 * 「我的提交」. No board for the page itself; it is laid out like the Skills publishing guide.
 */
export async function AppSubmit({ member, signIn, categories, name }: AppSubmitProps) {
  const t = await getTranslations('appSubmissions')
  const tApps = await getTranslations('apps')
  const locale = (await getLocale()) as Locale

  return (
    <main id="main" className="mx-auto flex w-full max-w-content flex-col gap-6 px-4 pt-5 pb-16 md:gap-8 md:pb-24">
      <nav aria-label={tApps('breadcrumb')} className="text-meta text-ink-4">
        <ol className="flex flex-wrap items-center gap-2">
          <li className="flex items-center gap-2">
            <Link href="/apps" className="hover:text-ink">
              {tApps('title')}
            </Link>
            <span aria-hidden="true">/</span>
          </li>
          <li aria-current="page" className="text-ink">
            {t('title')}
          </li>
        </ol>
      </nav>

      <div className="flex w-full max-w-190 flex-col gap-10 md:gap-12">
        <header className="flex flex-col gap-3">
          <h1 className="text-h2 md:text-h1">{t('title')}</h1>
          <p className="text-body text-ink-3">{t('intro')}</p>
        </header>

        <section id="form" aria-labelledby="form-title" className="flex scroll-mt-20 flex-col gap-4 rounded-card border border-surface-2 p-5 md:p-6">
          {member ? (
            // Heads the section itself: its title turns into「提交成功」 once the app is sent.
            <SubmitForm email={member.email} categories={categories} name={name} titleId="form-title" />
          ) : (
            <>
              <h2 id="form-title" className="text-h3 font-semibold">
                {t('form.title')}
              </h2>
              <div className="flex w-full max-w-105 flex-col gap-5">
                <p className="text-ui text-ink-3">{t('form.signIn')}</p>
                <Suspense>
                  <SignInForm providers={signIn} callbackURL={localizePath(locale, submitHref(name))} />
                </Suspense>
              </div>
            </>
          )}
        </section>

        {member && member.submissions.length > 0 && <MySubmissions submissions={member.submissions} />}
      </div>
    </main>
  )
}
