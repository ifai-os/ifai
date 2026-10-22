'use client'

import { useLocale, useTranslations } from 'next-intl'
import { useSearchParams } from 'next/navigation'
import { useState, type FormEvent } from 'react'

import { localizePath, type Locale } from '@/i18n/config'
import { useRouter } from '@/i18n/navigation'
import { authClient } from '@/lib/auth/client'
import type { AuthProviders } from '@/lib/auth/providers'

type Status = 'idle' | 'sending' | 'sent' | 'invalid' | 'failed'

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

export function SignInForm({ providers }: { providers: AuthProviders }) {
  const t = useTranslations('auth')
  const locale = useLocale() as Locale
  const router = useRouter()
  const searchParams = useSearchParams()
  const { data: session } = authClient.useSession()
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<Status>(searchParams.get('error') ? 'failed' : 'idle')

  const callbackURL = localizePath(locale, '/')
  const errorCallbackURL = localizePath(locale, '/sign-in')
  const hasSocial = providers.google || providers.github

  if (session?.user) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-card border border-surface-2 bg-surface p-6 text-center">
        <p className="text-body text-ink-2">{t('signedInAs', { email: session.user.email })}</p>
        <button
          type="button"
          onClick={async () => {
            await authClient.signOut()
            router.refresh()
          }}
          className="h-10 rounded-btn border border-line bg-bg px-4 text-ui text-ink hover:border-ink-4"
        >
          {t('signOut')}
        </button>
      </div>
    )
  }

  if (!hasSocial && !providers.email) {
    return <p className="rounded-card bg-warn p-4 text-center text-ui text-warn-ink">{t('unavailable')}</p>
  }

  async function signInWith(provider: 'google' | 'github') {
    setStatus('idle')
    const { error } = await authClient.signIn.social({ provider, callbackURL, errorCallbackURL })
    if (error) setStatus('failed')
  }

  async function sendLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const address = email.trim()
    if (!EMAIL_PATTERN.test(address)) {
      setStatus('invalid')
      return
    }
    setStatus('sending')
    const { error } = await authClient.signIn.magicLink({ email: address, callbackURL, errorCallbackURL })
    setStatus(error ? 'failed' : 'sent')
  }

  return (
    <div className="flex flex-col gap-5">
      {hasSocial && (
        <div className="flex flex-col gap-3">
          {providers.google && (
            <button type="button" onClick={() => signInWith('google')} className={secondaryButton}>
              {t('google')}
            </button>
          )}
          {providers.github && (
            <button type="button" onClick={() => signInWith('github')} className={secondaryButton}>
              {t('github')}
            </button>
          )}
        </div>
      )}

      {hasSocial && providers.email && (
        <div className="flex items-center gap-3 text-small text-ink-4" aria-hidden="true">
          <span className="h-px flex-1 bg-line" />
          {t('or')}
          <span className="h-px flex-1 bg-line" />
        </div>
      )}

      {providers.email &&
        (status === 'sent' ? (
          <p role="status" className="rounded-card bg-success-soft p-4 text-ui text-success-ink">
            {t('sent', { email: email.trim() })}
          </p>
        ) : (
          <form onSubmit={sendLink} noValidate className="flex flex-col gap-3">
            <label htmlFor="sign-in-email" className="text-meta font-medium text-ink-2">
              {t('emailLabel')}
            </label>
            <input
              id="sign-in-email"
              type="email"
              name="email"
              autoComplete="email"
              inputMode="email"
              required
              value={email}
              onChange={(event) => {
                setEmail(event.target.value)
                if (status === 'invalid') setStatus('idle')
              }}
              placeholder={t('emailPlaceholder')}
              aria-invalid={status === 'invalid' || undefined}
              aria-describedby={status === 'invalid' ? 'sign-in-email-error' : undefined}
              className={`h-11 rounded-thumb border bg-surface px-4 text-ui text-ink outline-none placeholder:text-ink-4 focus:border-ink-4 ${status === 'invalid' ? 'border-down' : 'border-surface-2'}`}
            />
            {status === 'invalid' && (
              <span id="sign-in-email-error" role="alert" className="text-small text-down">
                {t('invalidEmail')}
              </span>
            )}
            <button
              type="submit"
              disabled={status === 'sending'}
              className="h-11 rounded-btn bg-ink px-5 text-ui font-medium text-white disabled:opacity-60"
            >
              {status === 'sending' ? t('sending') : t('sendLink')}
            </button>
          </form>
        ))}

      {status === 'failed' && (
        <p role="alert" className="text-center text-small text-down">
          {t('failed')}
        </p>
      )}
    </div>
  )
}

const secondaryButton =
  'h-11 rounded-btn border border-line bg-bg px-5 text-ui font-medium text-ink transition-colors hover:border-ink-4'
