'use client'

import { useLocale, useTranslations } from 'next-intl'
import { type FormEvent, useId, useRef, useState } from 'react'

import { Icon } from '@/components/icon'
import { authClient } from '@/lib/auth/client'
import { readerTimeZone } from '@/lib/local-time'

import { isEmailAddress, normalizeEmail, suggestEmail, type EmailSuggestion } from '../address'

/**
 * column: the daily list's right column under「每日 AI 大事」(「IFAI 日报（新版）」).
 * card: after the stories on phones and tablets (「手机 · 日报」).
 * band: the home page, under「今天的 AI」(「IFAI 首页」).
 */
export type SubscribeBoxVariant = 'column' | 'card' | 'band'

const looks: Record<SubscribeBoxVariant, { box: string; text: string; title: string; note: string; form: string; row: string; input: string; idle: string; button: string }> = {
  // The board stacks title, note, address and button 12 apart.
  column: {
    box: 'flex flex-col gap-3 rounded-hero border border-surface-2 bg-surface p-5',
    text: 'flex flex-col gap-3',
    title: 'text-body font-medium',
    note: 'text-small leading-4.75 text-ink-4',
    form: 'flex flex-col gap-2',
    row: 'flex flex-col gap-3',
    input: 'h-10 w-full rounded-pill border bg-bg px-3.5 text-meta',
    idle: 'border-line',
    button: 'h-9 rounded-pill bg-ink px-4 text-meta font-medium text-bg',
  },
  card: {
    box: 'flex flex-col gap-3 rounded-card border border-line p-4.5',
    text: 'flex flex-col gap-1',
    title: 'text-title font-semibold',
    note: 'text-meta text-ink-4',
    form: 'flex flex-col gap-2',
    row: 'flex flex-col gap-2',
    input: 'h-11 w-full rounded-pill border bg-surface px-4 text-body',
    idle: 'border-surface-2',
    button: 'h-11 rounded-btn bg-ink px-5 text-body font-medium text-bg',
  },
  band: {
    box: 'flex flex-wrap items-center justify-between gap-x-8 gap-y-4 rounded-hero border border-line px-5 py-5 sm:px-7 sm:py-6',
    text: 'flex min-w-0 flex-[1_1_360px] flex-col gap-1.5',
    title: 'text-h3 font-semibold',
    note: 'text-meta text-ink-4',
    form: 'flex min-w-0 flex-[1_1_380px] flex-col gap-1.5',
    row: 'flex gap-2',
    input: 'h-11 min-w-0 flex-1 rounded-pill border bg-surface px-4 text-ui',
    idle: 'border-surface-2',
    button: 'h-11 flex-none rounded-btn bg-ink px-5 text-ui font-medium text-bg',
  },
}

type Problem = { kind: 'invalid' | 'failed' } | { kind: 'suggest'; suggestion: EmailSuggestion }

/**
 * The daily email's subscribe box (docs/specs/daily-email.md): an address and「订阅」, nothing
 * else. Language is the page's, time zone the browser's. A signed-in member finds their account
 * address filled in. A near miss of a common provider ("gmial.com") is pointed out once; pressing
 *「订阅」again sends it as typed.
 */
export function SubscribeBox({ variant }: { variant: SubscribeBoxVariant }) {
  const t = useTranslations('subscribe')
  const locale = useLocale()
  const { data: session } = authClient.useSession()
  const look = looks[variant]
  const id = useId()
  const [typed, setTyped] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [done, setDone] = useState(false)
  const [problem, setProblem] = useState<Problem | null>(null)
  const passedOver = useRef<string | null>(null)
  const trap = useRef<HTMLInputElement>(null)
  const status = useRef<HTMLParagraphElement>(null)

  // Until the reader types, the box shows the signed-in member's address.
  const email = typed ?? session?.user.email ?? ''

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const address = normalizeEmail(email)
    if (!isEmailAddress(address)) return setProblem({ kind: 'invalid' })
    const suggestion = suggestEmail(address)
    if (suggestion && passedOver.current !== address) {
      passedOver.current = address
      return setProblem({ kind: 'suggest', suggestion })
    }

    setSending(true)
    setProblem(null)
    try {
      const response = await fetch('/api/subscriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: address,
          locale,
          timeZone: readerTimeZone(),
          page: window.location.pathname,
          website: trap.current?.value ?? '',
        }),
      })
      if (response.ok) {
        setDone(true)
        requestAnimationFrame(() => status.current?.focus())
        return
      }
      const body = (await response.json().catch(() => null)) as { error?: string } | null
      setProblem({ kind: body?.error === 'invalid-email' ? 'invalid' : 'failed' })
    } catch {
      setProblem({ kind: 'failed' })
    } finally {
      setSending(false)
    }
  }

  const errorId = `${id}-error`
  const invalid = problem?.kind === 'invalid'
  const message = problem && (
    <p id={errorId} role="alert" className={`pl-4 text-small ${problem.kind === 'suggest' ? 'text-ink-2' : 'text-down'}`}>
      {problem.kind === 'suggest'
        ? t.rich('suggest', {
            domain: problem.suggestion.domain,
            fix: (chunks) => (
              <button
                type="button"
                onClick={() => {
                  setTyped(problem.suggestion.address)
                  setProblem(null)
                }}
                className="font-medium text-link underline underline-offset-2"
              >
                {chunks}
              </button>
            ),
          })
        : t(problem.kind)}
    </p>
  )

  return (
    <section aria-labelledby={`${id}-title`} className={look.box}>
      <div className={look.text}>
        <h2 id={`${id}-title`} className={look.title}>
          {t('title')}
        </h2>
        <p className={look.note}>{t('note')}</p>
      </div>

      {/* Present from the start, so screen readers announce the success when it appears. */}
      <p ref={status} role="status" tabIndex={-1} className={done ? 'flex items-center gap-2 text-body font-medium text-up outline-none' : 'sr-only'}>
        {done && (
          <>
            <Icon name="checkCircle" size={20} strokeWidth={2} />
            {t('done')}
          </>
        )}
      </p>

      {!done && (
        <form onSubmit={submit} noValidate aria-labelledby={`${id}-title`} className={look.form}>
          <div className={look.row}>
            <label htmlFor={`${id}-email`} className="sr-only">
              {t('email')}
            </label>
            <input
              id={`${id}-email`}
              type="email"
              name="email"
              autoComplete="email"
              inputMode="email"
              value={email}
              onChange={(event) => {
                setTyped(event.target.value)
                if (problem) setProblem(null)
              }}
              placeholder={t('email')}
              aria-invalid={invalid || undefined}
              aria-describedby={problem ? errorId : undefined}
              className={`${look.input} text-ink outline-none placeholder:text-ink-4 focus:border-ink-4 ${invalid ? 'border-down' : look.idle}`}
            />
            {variant !== 'band' && message}
            <button type="submit" disabled={sending} className={`${look.button} transition-colors hover:bg-ink-2 disabled:opacity-60`}>
              {t('submit')}
            </button>
          </div>
          {variant === 'band' && message}
          {/* For robots that fill in every field; people never see it (rule 9). */}
          <div aria-hidden="true" className="sr-only">
            <input ref={trap} type="text" name="website" tabIndex={-1} autoComplete="off" defaultValue="" />
          </div>
        </form>
      )}
    </section>
  )
}
