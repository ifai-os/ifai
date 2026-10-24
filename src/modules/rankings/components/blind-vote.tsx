'use client'

import { useLocale, useTranslations } from 'next-intl'
import { useCallback, useEffect, useId, useRef, useState } from 'react'

import { SignInDialog } from '@/components/auth/sign-in-dialog'
import { Button, ButtonLink } from '@/components/button'
import { EmptyState } from '@/components/states/empty-state'
import { LoadFailed } from '@/components/states/load-failed'
import { Skeleton, SkeletonLine } from '@/components/states/skeleton'
import { loadTimeoutMs, skeletonDelayMs } from '@/components/states/timing'
import { authClient } from '@/lib/auth/client'
import type { AuthProviders } from '@/lib/auth/providers'

import type { Battle, RevealedModel } from '../battles'
import { outcomes, type Outcome } from '../rules'
import { AnswerText } from './answer-text'

type Reveal = { counted: boolean; models: { a: RevealedModel; b: RevealedModel } }

type State =
  | { kind: 'loading' }
  | { kind: 'failed' }
  | { kind: 'empty' }
  | { kind: 'limit' }
  | { kind: 'ready'; battle: Battle; sending: Outcome | null; error: string | null }
  | { kind: 'revealed'; battle: Battle; outcome: Outcome; reveal: Reveal }

type BlindVoteProps = {
  /** The arena's slug. */
  arena: string
  /** The arena's rankings, for「看排行」. */
  boardHref: `/${string}`
  signIn: AuthProviders
}

const sides = ['a', 'b'] as const

/**
 * The blind vote (docs/specs/rankings.md「页面与路由」): a question with two anonymous answers,
 * four buttons, then who wrote which. Questions are loaded in the browser, so the page itself
 * is the same for everyone. Visitors see questions too; voting asks them to sign in, and they
 * come back to a new question.
 */
export function BlindVote({ arena, boardHref, signIn }: BlindVoteProps) {
  const t = useTranslations('rankingsVote')
  const locale = useLocale()
  const id = useId()
  const { data: session, isPending } = authClient.useSession()
  const signedIn = Boolean(session?.user)
  const [state, setState] = useState<State>({ kind: 'loading' })
  const [notice, setNotice] = useState<string | null>(null)
  /** Where signing in comes back to, while the dialog is open. */
  const [returnTo, setReturnTo] = useState<string | null>(null)
  /** Only the newest request's answer is shown. */
  const latest = useRef(0)
  const wasSignedIn = useRef<boolean | null>(null)
  const top = useRef<HTMLDivElement>(null)

  /** Asks for a question and shows it, unless a newer request started meanwhile; gives up after 10 s. */
  const request = useCallback(() => {
    const ticket = ++latest.current
    return fetch('/api/rankings/battles', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ arena, locale }),
      signal: AbortSignal.timeout(loadTimeoutMs),
    })
      .then(async (response) => ({
        status: response.status,
        data: response.ok ? ((await response.json()) as { battle?: Battle; empty?: boolean }) : null,
      }))
      .catch(() => ({ status: 0, data: null }))
      .then(({ status, data }) => {
        if (ticket !== latest.current) return
        if (status === 429) setState({ kind: 'limit' })
        else if (data?.empty) setState({ kind: 'empty' })
        else if (data?.battle) setState({ kind: 'ready', battle: data.battle, sending: null, error: null })
        else setState({ kind: 'failed' })
      })
  }, [arena, locale])

  useEffect(() => {
    void request()
  }, [request])

  /** A new question in place of this one, with a line saying why when there is one. */
  const next = useCallback(
    (message: string | null = null) => {
      setState({ kind: 'loading' })
      setNotice(message)
      void request()
      top.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
    },
    [request],
  )

  // Signed in meanwhile (in the dialog's other tab, say): the visitor's question has no id, so a new one.
  useEffect(() => {
    if (isPending) return
    if (wasSignedIn.current === false && signedIn) {
      setReturnTo(null)
      next()
    }
    wasSignedIn.current = signedIn
  }, [isPending, signedIn, next])

  async function vote(outcome: Outcome) {
    if (state.kind !== 'ready' || state.sending) return
    const { battle } = state
    if (!battle.id) {
      setReturnTo(window.location.pathname + window.location.search)
      return
    }
    setState({ ...state, sending: outcome, error: null })
    const response = await fetch(`/api/rankings/battles/${battle.id}/vote`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ outcome, locale }),
    }).catch(() => null)
    if (response?.ok) {
      setState({ kind: 'revealed', battle, outcome, reveal: (await response.json()) as Reveal })
      return
    }
    const status = response?.status ?? 0
    if (status === 401) {
      setState({ kind: 'ready', battle, sending: null, error: null })
      setReturnTo(window.location.pathname + window.location.search)
    } else if (status === 429) setState({ kind: 'limit' })
    else if (status === 404 || status === 409 || status === 410) next(t(status === 410 ? 'expired' : 'alreadyVoted'))
    else setState({ kind: 'ready', battle, sending: null, error: t('voteFailed') })
  }

  if (state.kind === 'loading') return <VoteSkeleton label={t('loading')} />
  if (state.kind === 'failed') return <LoadFailed onRetry={() => next()} />
  if (state.kind === 'empty' || state.kind === 'limit') {
    const empty = state.kind === 'empty'
    return (
      <EmptyState icon={empty ? 'rankings' : 'check'} title={t(empty ? 'emptyTitle' : 'limitTitle')} body={t(empty ? 'emptyBody' : 'limitBody')}>
        <ButtonLink href={boardHref} variant="secondary">
          {t('seeRankings')}
        </ButtonLink>
      </EmptyState>
    )
  }

  const { battle } = state
  const revealed = state.kind === 'revealed' ? state : null
  const picked = (side: 'a' | 'b') => revealed?.outcome === side

  return (
    <div ref={top} className="flex scroll-mt-20 flex-col gap-4">
      {notice && (
        <p role="status" className="rounded-thumb bg-warn px-3.5 py-2.5 text-meta text-warn-ink">
          {notice}
        </p>
      )}
      <section aria-labelledby={`${id}-question`} className="flex flex-col gap-2 rounded-hero border border-surface-2 bg-surface p-5 md:p-6">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id={`${id}-question`} className="text-small text-ink-4">
            {t('question')}
          </h2>
          {!revealed && (
            <button type="button" onClick={() => next()} className="text-meta text-link hover:underline">
              {t('another')}
            </button>
          )}
        </div>
        <p lang={battle.prompt.lang} className="text-body whitespace-pre-wrap wrap-anywhere">
          {battle.prompt.text}
        </p>
      </section>

      <div className="grid items-start gap-4 md:grid-cols-2">
        {sides.map((side, index) => {
          const model = revealed?.reveal.models[side]
          return (
            <section
              key={side}
              aria-labelledby={`${id}-${side}`}
              className={`flex min-w-0 flex-col gap-3 rounded-card border bg-bg p-4 md:p-5 ${picked(side) ? 'border-ink' : 'border-surface-2'}`}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <h3 id={`${id}-${side}`} className="text-title">
                  {t(side === 'a' ? 'modelA' : 'modelB')}
                  {picked(side) && <span className="ml-2 text-small font-normal text-accent">{t('yourPick')}</span>}
                </h3>
                {model && (
                  <p className="text-meta text-ink-4">
                    <span className="font-semibold text-ink">{model.name}</span>
                    {model.org && ` · ${model.org}`}
                  </p>
                )}
              </div>
              <div role="region" aria-labelledby={`${id}-${side}`} tabIndex={0} className="rounded-thumb md:max-h-150 md:overflow-y-auto md:pr-1">
                <AnswerText text={battle.answers[index].text} lang={battle.answers[index].lang} />
              </div>
            </section>
          )
        })}
      </div>

      <div className="sticky bottom-0 z-10 -mx-4 flex flex-col gap-2 border-t border-line bg-bg px-4 py-3 md:mx-0 md:px-0">
        {state.kind === 'revealed' ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p role="status" className={`text-meta ${state.reveal.counted ? 'text-ink-2' : 'text-warn-ink'}`}>
              {t(state.reveal.counted ? 'counted' : 'notCounted')}
            </p>
            <div className="flex flex-wrap gap-2">
              <ButtonLink href={boardHref} variant="secondary">
                {t('seeRankings')}
              </ButtonLink>
              <Button onClick={() => next()}>{t('next')}</Button>
            </div>
          </div>
        ) : (
          <>
            {state.error && (
              <p role="alert" className="text-meta text-down">
                {state.error}
              </p>
            )}
            <div role="group" aria-label={t('choices')} className="grid grid-cols-2 gap-2 md:grid-cols-4">
              {outcomes.map((outcome) => (
                <Button
                  key={outcome}
                  variant="secondary"
                  disabled={state.sending !== null}
                  aria-busy={state.sending === outcome}
                  onClick={() => void vote(outcome)}
                  className="w-full disabled:opacity-60"
                >
                  {t(`outcomes.${outcome}`)}
                </Button>
              ))}
            </div>
          </>
        )}
      </div>

      <SignInDialog
        open={returnTo !== null}
        onClose={() => setReturnTo(null)}
        title={t('signInTitle')}
        providers={signIn}
        callbackURL={returnTo ?? ''}
        sentNote={t('afterSignIn')}
      />
    </div>
  )
}

/** The question and two answers as shimmering blocks, shown after 300 ms so a fast answer never flashes one. */
function VoteSkeleton({ label }: { label: string }) {
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), skeletonDelayMs)
    return () => clearTimeout(timer)
  }, [])
  return (
    <div role="status" aria-label={label} aria-busy="true" className={`flex flex-col gap-4 ${visible ? '' : 'invisible'}`}>
      <div className="flex flex-col gap-2 rounded-hero border border-surface-2 bg-surface p-5 md:p-6">
        <SkeletonLine text="text-small" width="20%" />
        <SkeletonLine text="text-body" width="85%" />
        <SkeletonLine text="text-body" width="60%" />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {sides.map((side) => (
          <div key={side} className="flex flex-col gap-3 rounded-card border border-surface-2 p-4 md:p-5">
            <SkeletonLine text="text-title" width="30%" />
            {[92, 80, 86, 64].map((width) => (
              <Skeleton key={width} className="h-3" style={{ width: `${width}%` }} />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
