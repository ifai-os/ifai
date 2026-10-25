'use client'

import { useLocale, useTranslations } from 'next-intl'
import { useSearchParams } from 'next/navigation'
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'

import { Icon } from '@/components/icon'

import { localizePath, type Locale } from '@/i18n/config'
import { Link, useRouter } from '@/i18n/navigation'
import { authClient } from '@/lib/auth/client'
import type { AuthProviders } from '@/lib/auth/providers'
import { legalHref } from '@/modules/legal/documents'

type Status = 'idle' | 'sending' | 'sent' | 'invalid' | 'failed'

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

/** Seconds before the same link can be asked for again (docs/specs/account.md). Better Auth allows 5 a minute. */
const RESEND_AFTER = 60

type SignInFormProps = {
  providers: AuthProviders
  /** Where signing in lands: a path on this site, with the locale prefix. The home page unless given. */
  callbackURL?: string
  /** One more line once the link is sent, such as that the save will finish by itself. */
  sentNote?: string
  /** In a dialog (the「需要登录」board): the email form first, the other two ways side by side. */
  compact?: boolean
  /** The sign-in page's own heading: above the form, and replaced by「登录链接已发送」as the page's heading once the link is sent. */
  header?: ReactNode
}

export function SignInForm({ providers, callbackURL, sentNote, compact = false, header }: SignInFormProps) {
  const t = useTranslations('auth')
  const locale = useLocale() as Locale
  const router = useRouter()
  const searchParams = useSearchParams()
  const { data: session } = authClient.useSession()
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<Status>(searchParams.get('error') ? 'failed' : 'idle')
  // Once sent: the countdown to「重新发送」, and how sending again went.
  const [wait, setWait] = useState(0)
  const [resend, setResend] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle')
  // Back from「换个邮箱」: the email field takes the focus as it comes back.
  const refocus = useRef(false)

  useEffect(() => {
    if (status !== 'sent' || wait <= 0) return
    const timer = setTimeout(() => setWait((seconds) => seconds - 1), 1000)
    return () => clearTimeout(timer)
  }, [status, wait])

  const landing = callbackURL ?? localizePath(locale, '/')
  const errorCallbackURL = localizePath(locale, '/sign-in')
  const hasSocial = providers.google || providers.github
  // The page's heading goes above everything but「登录链接已发送」, which takes its place.
  const headed = (content: ReactNode) =>
    header ? (
      <div className="flex flex-col gap-8">
        {header}
        {content}
      </div>
    ) : (
      content
    )

  if (session?.user) {
    return headed(
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
      </div>,
    )
  }

  if (!hasSocial && !providers.email) {
    return headed(<p className="rounded-card bg-warn p-4 text-center text-ui text-warn-ink">{t('unavailable')}</p>)
  }

  if (status === 'sent') {
    const address = email.trim()
    const Title = header ? 'h1' : 'p'
    return (
      <div className="flex flex-col items-start gap-5">
        <span aria-hidden="true" className={`flex items-center justify-center rounded-pill bg-success-soft text-success-ink ${compact ? 'size-11' : 'size-14'}`}>
          <Icon name="mail" size={compact ? 22 : 26} />
        </span>
        <div role="status" className="flex flex-col gap-1.5">
          <Title className={header ? 'text-h2' : 'text-title font-semibold'}>{t('sentTitle')}</Title>
          <p className="text-body text-ink-3">
            {t.rich('sentBody', { email: () => <b className="font-semibold break-all text-ink">{address}</b> })}
            {sentNote && `${sentenceGap(locale)}${sentNote}`}
          </p>
        </div>
        <p className="w-full rounded-tile bg-surface px-4 py-3.5 text-meta text-ink-3">{t('sentTip')}</p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <button
            type="button"
            onClick={() => {
              refocus.current = true
              setResend('idle')
              setStatus('idle')
            }}
            className={`${secondaryButton} h-11`}
          >
            {t('changeEmail')}
          </button>
          {wait > 0 ? (
            <span className="text-meta text-ink-4">{t('resendIn', { seconds: wait })}</span>
          ) : (
            <button type="button" onClick={sendAgain} disabled={resend === 'sending'} className="h-11 text-meta text-link hover:underline disabled:opacity-60">
              {resend === 'sending' ? t('sending') : t('resendNow')}
            </button>
          )}
        </div>
        {resend === 'sent' && (
          <p role="status" className="text-small text-up">
            {t('resent')}
          </p>
        )}
        {resend === 'failed' && (
          <p role="alert" className="text-small text-down">
            {t('failed')}
          </p>
        )}
      </div>
    )
  }

  async function signInWith(provider: 'google' | 'github') {
    setStatus('idle')
    const { error } = await authClient.signIn.social({ provider, callbackURL: landing, errorCallbackURL })
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
    const { error } = await authClient.signIn.magicLink({ email: address, callbackURL: landing, errorCallbackURL })
    setStatus(error ? 'failed' : 'sent')
    if (!error) setWait(RESEND_AFTER)
  }

  async function sendAgain() {
    setResend('sending')
    const { error } = await authClient.signIn
      .magicLink({ email: email.trim(), callbackURL: landing, errorCallbackURL })
      .catch(() => ({ error: { code: 'NETWORK' } }))
    setResend(error ? 'failed' : 'sent')
    if (!error) setWait(RESEND_AFTER)
  }

  const social = hasSocial && (
    <div className={compact && providers.google && providers.github ? 'grid grid-cols-2 gap-2' : 'flex flex-col gap-3'}>
      {providers.google && (
        <button type="button" onClick={() => signInWith('google')} className={secondaryButton}>
          {compact ? t('googleShort') : t('google')}
        </button>
      )}
      {providers.github && (
        <button type="button" onClick={() => signInWith('github')} className={secondaryButton}>
          {compact ? t('githubShort') : t('github')}
        </button>
      )}
    </div>
  )

  const emailForm = providers.email && (
    <form onSubmit={sendLink} noValidate className={`flex flex-col ${compact ? 'gap-2' : 'gap-3'}`}>
      <label htmlFor="sign-in-email" className={compact ? 'sr-only' : 'text-meta font-medium text-ink-2'}>
        {t('emailLabel')}
      </label>
      <input
        ref={(node) => {
          if (node && refocus.current) {
            refocus.current = false
            node.focus()
          }
        }}
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
        className="h-11 rounded-btn bg-ink px-5 text-ui font-medium text-bg disabled:opacity-60"
      >
        {status === 'sending' ? t('sending') : t('sendLink')}
      </button>
      {!compact && <p className="text-center text-small text-ink-4">{t('noPassword')}</p>}
    </form>
  )

  const divider = hasSocial && providers.email && (
    <div className="flex items-center gap-3 text-small text-ink-4" aria-hidden="true">
      <span className="h-px flex-1 bg-line" />
      {t('or')}
      <span className="h-px flex-1 bg-line" />
    </div>
  )

  return headed(
    <div className={`flex flex-col ${compact ? 'gap-3' : 'gap-5'}`}>
      {compact ? emailForm : social}
      {divider}
      {compact ? social : emailForm}

      {status === 'failed' && (
        <p role="alert" className="text-center text-small text-down">
          {t('failed')}
        </p>
      )}

      <p className="text-center text-small text-ink-4">
        {t.rich('agree', {
          terms: (chunks) => legalLink(legalHref.terms, chunks),
          privacy: (chunks) => legalLink(legalHref.privacy, chunks),
        })}
      </p>
    </div>,
  )
}

/** In a new tab, so a half-filled dialog stays where it was (docs/specs/legal.md). */
function legalLink(href: `/${string}`, chunks: ReactNode) {
  return (
    <Link href={href} target="_blank" className="text-link hover:underline">
      {chunks}
    </Link>
  )
}

/** Chinese and Japanese run sentences together; English and Korean put a space between them. */
function sentenceGap(locale: Locale): string {
  return locale.startsWith('zh') || locale === 'ja' ? '' : ' '
}

const secondaryButton =
  'h-11 rounded-btn border border-line bg-bg px-5 text-ui font-medium text-ink transition-colors hover:border-ink-4'
