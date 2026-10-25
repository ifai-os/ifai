'use client'

import { useLocale, useTranslations } from 'next-intl'
import { useState } from 'react'

import { LocalTime } from '@/components/local-time'
import type { Locale } from '@/i18n/config'
import { useRouter } from '@/i18n/navigation'
import { authClient } from '@/lib/auth/client'
import type { AuthProviders } from '@/lib/auth/providers'
import type { LinkedAccount, SocialProvider } from '@/lib/auth/settings'

import { sectionPath } from './sections'
import { rowButton, SettingsCard, SettingsRow } from './settings-ui'

const providerNames: Record<SocialProvider, string> = { google: 'Google', github: 'GitHub' }

/** Back from Google or GitHub: which one, and Better Auth's error code when connecting failed. */
export type LinkResult = { provider: SocialProvider; error: string | null }

type Problem = { kind: 'stale' | 'failed'; provider: SocialProvider }

/**
 * 「登录方式」(docs/specs/account.md): Google and GitHub, as far as this site has them, connected
 * or not, and the email link. Connecting goes to the provider and comes back here. Disconnecting
 * wants a sign-in from the last day (Better Auth's `freshAge`), and never takes away the only way
 * in: the last account stays unless the email link can sign the member in.
 */
export function SignInMethods({ accounts, providers, result }: { accounts: LinkedAccount[]; providers: AuthProviders; result: LinkResult | null }) {
  const t = useTranslations('account')
  const locale = useLocale() as Locale
  const router = useRouter()
  const [busy, setBusy] = useState<SocialProvider | null>(null)
  const [problem, setProblem] = useState<Problem | null>(null)
  const shown = (['google', 'github'] as const).filter((provider) => providers[provider])
  const onlyWay = accounts.length === 1 && !providers.email

  async function connect(provider: SocialProvider) {
    setBusy(provider)
    setProblem(null)
    const back = sectionPath(locale, 'sign-in', `provider=${provider}`)
    const { error } = await authClient
      .linkSocial({ provider, callbackURL: back, errorCallbackURL: back })
      .catch(() => ({ error: { code: 'NETWORK' } }))
    // On success the browser is on its way to the provider.
    if (error) {
      setBusy(null)
      setProblem({ kind: 'failed', provider })
    }
  }

  async function disconnect(account: LinkedAccount) {
    setBusy(account.provider)
    setProblem(null)
    const { error } = await authClient.unlinkAccount({ accountId: account.id }).catch(() => ({ error: { code: 'NETWORK' } }))
    setBusy(null)
    if (error) {
      setProblem({ kind: error.code === 'SESSION_NOT_FRESH' ? 'stale' : 'failed', provider: account.provider })
      return
    }
    router.refresh()
  }

  async function signInAgain() {
    await authClient.signOut()
    router.refresh()
  }

  // Coming back from the provider, until the member does something else here.
  const notice = problem === null && result !== null ? result : null

  return (
    <div className="flex flex-col gap-3">
      {notice && (
        <p role={notice.error ? 'alert' : 'status'} className={`rounded-tile p-3.5 text-meta ${notice.error ? 'bg-accent-soft text-down' : 'bg-success-soft text-success-ink'}`}>
          {notice.error
            ? t(notice.error === 'account_already_linked_to_different_user' ? 'linkTaken' : 'linkFailed', { provider: providerNames[notice.provider] })
            : t('linked', { provider: providerNames[notice.provider] })}
        </p>
      )}
      {problem && (
        <div role="alert" className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-tile bg-surface p-3.5 text-meta text-ink-2">
          <span className="flex-[1_1_240px]">
            {problem.kind === 'stale' ? t('unlinkSignInAgain') : t('linkFailed', { provider: providerNames[problem.provider] })}
          </span>
          {problem.kind === 'stale' && (
            <button type="button" onClick={signInAgain} className={rowButton.primary}>
              {t('signInAgainButton')}
            </button>
          )}
        </div>
      )}

      <SettingsCard>
        {shown.map((provider) => {
          const account = accounts.find((item) => item.provider === provider)
          const name = providerNames[provider]
          if (!account) {
            return (
              <SettingsRow
                key={provider}
                title={name}
                description={t('notLinked')}
                action={
                  <button type="button" onClick={() => connect(provider)} disabled={busy !== null} aria-label={t('linkLabel', { provider: name })} className={rowButton.primary}>
                    {t('link')}
                  </button>
                }
              />
            )
          }
          return (
            <SettingsRow
              key={provider}
              title={name}
              description={
                <>
                  {t.rich('linkedOn', { date: () => <LocalTime iso={account.linkedAt} style="date" /> })}
                  {onlyWay && (
                    <>
                      <br />
                      {t('onlyWay')}
                    </>
                  )}
                </>
              }
              action={
                <button
                  type="button"
                  onClick={() => disconnect(account)}
                  disabled={busy !== null || onlyWay}
                  aria-label={t('unlinkLabel', { provider: name })}
                  className={rowButton.secondary}
                >
                  {busy === provider ? t('unlinking') : t('unlink')}
                </button>
              }
            />
          )
        })}
        {providers.email && <SettingsRow title={t('emailLink')} description={t('emailLinkNote')} action={<span className="text-meta text-ink-4">{t('alwaysOn')}</span>} />}
      </SettingsCard>
    </div>
  )
}
