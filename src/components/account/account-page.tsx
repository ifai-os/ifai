import { useLocale, useTranslations } from 'next-intl'
import { Suspense } from 'react'

import { SignInForm } from '@/components/auth/sign-in-form'
import { ButtonLink } from '@/components/button'
import { ThemePicker } from '@/components/theme-picker'
import { isLaunched } from '@/config/site'
import type { Locale } from '@/i18n/config'
import { Link } from '@/i18n/navigation'
import type { AuthProviders } from '@/lib/auth/providers'
import type { DailyEmailState, LinkedAccount, SignedInDevice } from '@/lib/auth/settings'
import { SubscribeBox } from '@/modules/daily/email/components/subscribe-box'

import { DeleteAccount } from './delete-account'
import { ExportData } from './export-data'
import { LanguageChoice } from './language-choice'
import { ProfileForm } from './profile-form'
import { sectionPath, type SettingsSection } from './sections'
import { SettingsNav } from './settings-nav'
import { GroupTitle, SectionTitle, SettingsCard, SettingsRow } from './settings-ui'
import { SignInMethods, type LinkResult } from './sign-in-methods'
import { SignedInDevices } from './signed-in-devices'

/** What the open section needs; the page reads only that. */
export type SettingsView =
  | { section: 'profile' }
  | { section: 'sign-in'; accounts: LinkedAccount[]; devices: SignedInDevice[]; result: LinkResult | null }
  | { section: 'notifications'; dailyEmail: DailyEmailState; subscribing: boolean }
  | { section: 'language' }
  | { section: 'data' }

type Member = { id: string; email: string; name: string }

type AccountPageProps = {
  /** The signed-in member and what their open section needs; null for a visitor, who gets the sign-in form. */
  member: { user: Member; view: SettingsView } | null
  /** The open section, which a visitor comes back to once signed in. */
  section: SettingsSection
  /** Just deleted: the account page is where deleting lands. */
  deleted: boolean
  signIn: AuthProviders
}

/**
 * 「设置」(docs/specs/account.md, the「IFAI 账号设置」board): the sections down the side (across
 * the top on phones), one open at a time by its address.
 */
export function AccountPage({ member, section, deleted, signIn }: AccountPageProps) {
  const t = useTranslations('account')
  const locale = useLocale() as Locale

  return (
    <main id="main" className="mx-auto flex w-full max-w-250 flex-col gap-5 px-4 pt-6 pb-16 md:gap-7 md:pt-10 md:pb-24">
      <h1 className="text-h2 md:text-h1">{t('title')}</h1>

      {member === null ? (
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
              <SignInForm providers={signIn} callbackURL={sectionPath(locale, section)} />
            </Suspense>
          </div>
        )
      ) : (
        <div className="flex flex-col gap-6 md:flex-row md:items-start md:gap-10">
          <SettingsNav current={member.view.section} />
          <div className="flex min-w-0 max-w-180 flex-1 flex-col gap-4">
            <Section view={member.view} member={member.user} signIn={signIn} />
          </div>
        </div>
      )}
    </main>
  )
}

function Section({ view, member, signIn }: { view: SettingsView; member: Member; signIn: AuthProviders }) {
  const t = useTranslations('account')
  const title = <SectionTitle>{t(`sections.${view.section}`)}</SectionTitle>

  switch (view.section) {
    case 'profile':
      return (
        <>
          {title}
          <ProfileForm userId={member.id} name={member.name} email={member.email} />
        </>
      )

    case 'sign-in':
      return (
        <>
          {title}
          <SettingsCard>
            <SettingsRow title={t('email')} description={member.email} />
          </SettingsCard>
          <GroupTitle>{t('methodsTitle')}</GroupTitle>
          <SignInMethods accounts={view.accounts} providers={signIn} result={view.result} />
          <GroupTitle>{t('devicesTitle')}</GroupTitle>
          <SignedInDevices devices={view.devices} />
        </>
      )

    case 'notifications': {
      const { dailyEmail } = view
      return (
        <>
          {title}
          <GroupTitle>{t('emailsTitle')}</GroupTitle>
          <SettingsCard>
            <SettingsRow title={t('securityEmails')} description={t('securityEmailsNote')} action={<span className="text-meta text-ink-4">{t('alwaysSent')}</span>} />
            <SettingsRow
              title={t('dailyEmail')}
              description={t(dailyEmail.status === 'subscribed' ? 'dailySubscribed' : dailyEmail.status === 'stopped' ? 'dailyStopped' : 'dailyNone')}
              action={
                dailyEmail.status !== 'none' && (
                  <Link href={`/daily/subscription?token=${encodeURIComponent(dailyEmail.token)}`} className="text-meta whitespace-nowrap text-link hover:underline">
                    {t('manageDaily')} ›
                  </Link>
                )
              }
            />
          </SettingsCard>
          {dailyEmail.status === 'none' && view.subscribing && <SubscribeBox variant="card" />}
        </>
      )
    }

    case 'language':
      return (
        <>
          {title}
          <SettingsCard>
            <SettingsRow title={t('appearanceLabel')} description={t('appearanceNote')} action={<ThemePicker />} />
            <SettingsRow title={t('languageLabel')} description={t('languageNote')} action={<LanguageChoice />} below />
          </SettingsCard>
        </>
      )

    case 'data':
      return (
        <>
          {title}
          <section aria-labelledby="export-data" className="flex flex-col items-start gap-3 rounded-card border border-surface-2 p-4 md:p-7">
            <h3 id="export-data" className="text-title font-semibold">
              {t('exportTitle')}
            </h3>
            <p className="text-ui text-ink-3">{t('exportBody')}</p>
            {isLaunched('circles') && <p className="text-ui text-ink-3">{t('exportCircles')}</p>}
            <ExportData />
          </section>
          <section aria-labelledby="delete-account" className="flex flex-col items-start gap-3 rounded-card border border-surface-2 p-4 md:p-7">
            <h3 id="delete-account" className="text-title font-semibold">
              {t('deleteTitle')}
            </h3>
            <p className="text-ui text-ink-3">{t('deleteBody')}</p>
            {isLaunched('circles') && <p className="text-ui text-ink-3">{t('deleteCircles')}</p>}
            <p className="text-ui text-ink-3">{t('deleteKeeps')}</p>
            <DeleteAccount />
          </section>
        </>
      )
  }
}
