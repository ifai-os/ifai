import { getLocale, getTranslations } from 'next-intl/server'
import { Suspense, type ReactNode } from 'react'

import { SignInForm } from '@/components/auth/sign-in-form'
import { localizePath, type Locale } from '@/i18n/config'
import { Link } from '@/i18n/navigation'
import type { AuthProviders } from '@/lib/auth/providers'

import { submitHref } from '../../public/list-params'
import { SubmitForm } from './submit-form'

const beforeKeys = ['repo', 'license', 'safe', 'languages'] as const
const afterKeys = ['number', 'review', 'result', 'certified'] as const

type SkillSubmitProps = {
  /** The signed-in member, whose email fills the contact field; null for a visitor, who gets the sign-in form. */
  member: { email: string } | null
  signIn: AuthProviders
}

/**
 * 发布指南与投稿 (docs/specs/resources.md「页面与路由」, rule 12): what a Skill needs before it is
 * sent, what happens after, and the form (members only). No board; it follows the install guide.
 */
export async function SkillSubmit({ member, signIn }: SkillSubmitProps) {
  const t = await getTranslations('resources')
  const locale = (await getLocale()) as Locale

  return (
    <main id="main" className="mx-auto flex w-full max-w-content flex-col gap-6 px-4 pt-5 pb-16 md:gap-8 md:pb-24">
      <nav aria-label={t('breadcrumb')} className="text-meta text-ink-4">
        <ol className="flex flex-wrap items-center gap-2">
          <li className="flex items-center gap-2">
            <Link href="/resources" className="hover:text-ink">
              {t('resources')}
            </Link>
            <span aria-hidden="true">/</span>
          </li>
          <li className="flex items-center gap-2">
            <Link href="/resources" className="hover:text-ink">
              {t('title')}
            </Link>
            <span aria-hidden="true">/</span>
          </li>
          <li aria-current="page" className="text-ink">
            {t('submit.title')}
          </li>
        </ol>
      </nav>

      <div className="flex w-full max-w-190 flex-col gap-10 md:gap-12">
        <header className="flex flex-col gap-3">
          <h1 className="text-h2 md:text-h1">{t('submit.title')}</h1>
          <p className="text-body text-ink-3">{t('submit.intro')}</p>
        </header>

        <Section id="before" title={t('submit.before.title')}>
          <ul className="flex list-disc flex-col gap-2 pl-5 text-ui text-ink-2">
            {beforeKeys.map((key) => (
              <li key={key}>{t(`submit.before.${key}`)}</li>
            ))}
          </ul>
        </Section>

        <Section id="after" title={t('submit.after.title')}>
          <ol className="flex flex-col gap-4">
            {afterKeys.map((key, index) => (
              <li key={key} className="grid grid-cols-[32px_minmax(0,1fr)] gap-3">
                <span
                  aria-hidden="true"
                  className={`flex size-8 items-center justify-center rounded-pill text-meta font-semibold ${index === 0 ? 'bg-ink text-bg' : 'bg-surface text-ink'}`}
                >
                  {index + 1}
                </span>
                <span className="pt-1.5 text-ui text-ink-2">{t(`submit.after.${key}`)}</span>
              </li>
            ))}
          </ol>
        </Section>

        <section id="form" aria-labelledby="form-title" className="flex scroll-mt-20 flex-col gap-4 rounded-card border border-surface-2 p-5 md:p-6">
          {member ? (
            // Heads the section itself: its title turns into「提交成功」 once the Skill is sent.
            <SubmitForm email={member.email} titleId="form-title" />
          ) : (
            <>
              <h2 id="form-title" className="text-h3 font-semibold">
                {t('submit.form.title')}
              </h2>
              <div className="flex w-full max-w-105 flex-col gap-5">
                <p className="text-ui text-ink-3">{t('submit.form.signIn')}</p>
                <Suspense>
                  <SignInForm providers={signIn} callbackURL={localizePath(locale, submitHref)} />
                </Suspense>
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  )
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="flex scroll-mt-20 flex-col gap-3.5">
      <h2 id={`${id}-title`} className="text-h3 font-semibold">
        {title}
      </h2>
      {children}
    </section>
  )
}
