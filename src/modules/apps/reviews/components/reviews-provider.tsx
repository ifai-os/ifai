'use client'

import { useLocale, useTranslations } from 'next-intl'
import { createContext, use, useCallback, useEffect, useRef, useState, type ReactNode } from 'react'

import { SignInDialog } from '@/components/auth/sign-in-dialog'
import { loadTimeoutMs } from '@/components/states/timing'
import type { Locale } from '@/i18n/config'
import { authClient } from '@/lib/auth/client'
import type { AuthProviders } from '@/lib/auth/providers'

import type { ReportReason, ReviewsError, ReviewsPage, ReviewTranslation } from '../rules'
import { ReviewDialog, type ReviewDraft } from './review-dialog'

type Status = 'loading' | 'ready' | 'failed'

/** What sending the review form came to: done, or why not. */
export type SubmitResult = 'ok' | 'sign-in' | 'failed' | ReviewsError

type ReviewedApp = { id: number; name: string }

type ReviewsContextValue = {
  app: ReviewedApp
  status: Status
  /** The pages loaded so far, merged; null until the first arrives. */
  page: ReviewsPage | null
  /** When the reviews were loaded, for「3 天前」. */
  loadedAt: number
  loadingMore: boolean
  moreFailed: boolean
  loadMore: () => void
  retry: () => void
  /** Opens the review form, or the sign-in dialog for a visitor. */
  write: () => void
  /** Deletes the member's review; false when it did not work. */
  remove: () => Promise<boolean>
  report: (reviewId: number, reason: ReportReason) => Promise<boolean>
  /** A review in the page's language, by machine; null when it did not load. */
  translate: (reviewId: number) => Promise<string | null>
}

const ReviewsContext = createContext<ReviewsContextValue | null>(null)

/** The reviews from the ReviewsProvider around the page. */
export function useReviews(): ReviewsContextValue {
  const value = use(ReviewsContext)
  if (!value) throw new Error('useReviews needs a ReviewsProvider around it')
  return value
}

/** ?review=write: signing in comes back with it, and the review form opens. */
const pendingParam = 'review'
const pendingValue = 'write'

async function fetchPage(url: string, init?: RequestInit): Promise<{ status: number; page: ReviewsPage | null; error?: ReviewsError }> {
  const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(loadTimeoutMs), ...init }).catch(() => null)
  if (!response) return { status: 0, page: null }
  const data = (await response.json().catch(() => null)) as (ReviewsPage & { error?: ReviewsError }) | null
  return response.ok && data ? { status: response.status, page: data } : { status: response.status, page: null, error: data?.error }
}

type ReviewsProviderProps = {
  app: ReviewedApp
  /** The sign-in methods, for the dialog a visitor gets on pressing「写评价」. */
  signIn: AuthProviders
  children: ReactNode
}

/**
 * An app's reviews, read in the browser so its page stays static (docs/specs/apps.md「评价」):
 * the summary in the header and the reviews section share them. A visitor who presses「写评价」
 * gets the sign-in dialog; signing in comes back here with ?review=write and the form opens, as
 * it does when they sign in from another tab with the dialog open.
 */
export function ReviewsProvider({ app, signIn, children }: ReviewsProviderProps) {
  const t = useTranslations('reviews')
  const locale = useLocale() as Locale
  const { data: session, isPending } = authClient.useSession()
  const signedIn = Boolean(session?.user)
  const memberName = session?.user.name ?? ''
  const [page, setPage] = useState<ReviewsPage | null>(null)
  const [status, setStatus] = useState<Status>('loading')
  const [loadedAt, setLoadedAt] = useState(0)
  const [loadingMore, setLoadingMore] = useState(false)
  const [moreFailed, setMoreFailed] = useState(false)
  const [writing, setWriting] = useState(false)
  /** Where signing in comes back to, while the dialog is open. */
  const [returnTo, setReturnTo] = useState<string | null>(null)
  /** Only the newest first-page request's answer is shown. */
  const latest = useRef(0)
  /** Pressed「写评价」in this tab before signing in. */
  const wanted = useRef(false)

  const show = useCallback((next: ReviewsPage) => {
    setPage(next)
    setStatus('ready')
    setLoadedAt(Date.now())
  }, [])

  /** Reads the first page and shows it when it arrives, unless a newer read started meanwhile. */
  const load = useCallback(() => {
    const ticket = ++latest.current
    return fetchPage(`/api/reviews?app=${app.id}&locale=${locale}`).then(({ page: next }) => {
      if (ticket !== latest.current) return
      if (next) show(next)
      // A failed reload keeps what is on screen.
      else setStatus((current) => (current === 'ready' ? current : 'failed'))
    })
  }, [app.id, locale, show])

  const askToSignIn = useCallback(() => {
    wanted.current = true
    const url = new URL(window.location.href)
    url.searchParams.set(pendingParam, pendingValue)
    setReturnTo(url.pathname + url.search)
  }, [])

  // Once the session is known, and again on signing in or out: read the reviews (the member's own
  // comes apart), and open the form for a review started before signing in.
  useEffect(() => {
    if (isPending) return
    const url = new URL(window.location.href)
    const returned = url.searchParams.get(pendingParam) === pendingValue
    if (returned) {
      url.searchParams.delete(pendingParam)
      window.history.replaceState(null, '', url.pathname + url.search + url.hash)
    }
    if (signedIn && (returned || wanted.current)) {
      wanted.current = false
      setReturnTo(null)
      setWriting(true)
    }
    void load()
  }, [isPending, signedIn, load])

  const loadMore = useCallback(async () => {
    if (!page?.next || loadingMore) return
    setLoadingMore(true)
    setMoreFailed(false)
    const { page: more } = await fetchPage(`/api/reviews?app=${app.id}&before=${page.next}&locale=${locale}`)
    setLoadingMore(false)
    if (!more) {
      setMoreFailed(true)
      return
    }
    setPage((current) => {
      if (!current) return more
      const seen = new Set(current.reviews.map((review) => review.id))
      return { ...more, reviews: [...current.reviews, ...more.reviews.filter((review) => !seen.has(review.id))] }
    })
  }, [app.id, locale, page, loadingMore])

  const write = useCallback(() => {
    if (isPending) return
    if (signedIn) setWriting(true)
    else askToSignIn()
  }, [isPending, signedIn, askToSignIn])

  const submit = useCallback(
    async ({ rating, body, name }: ReviewDraft): Promise<SubmitResult> => {
      // The name is the member's own, shown with all their reviews.
      if (name !== memberName.trim()) {
        const { error } = await authClient.updateUser({ name })
        if (error) return 'failed'
      }
      const result = await fetchPage('/api/reviews', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ app: app.id, rating, body, locale }),
      })
      if (result.page) {
        show(result.page)
        return 'ok'
      }
      if (result.status === 401) {
        setWriting(false)
        askToSignIn()
        return 'sign-in'
      }
      return result.error ?? 'failed'
    },
    [app.id, locale, memberName, show, askToSignIn],
  )

  const remove = useCallback(async () => {
    const { page: next } = await fetchPage(`/api/reviews?app=${app.id}&locale=${locale}`, { method: 'DELETE' })
    if (next) show(next)
    return Boolean(next)
  }, [app.id, locale, show])

  const report = useCallback(async (reviewId: number, reason: ReportReason) => {
    const response = await fetch('/api/reviews/report', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ review: reviewId, reason }),
    }).catch(() => null)
    return Boolean(response?.ok)
  }, [])

  // Read only when the reader asks: translations stay out of the page and out of search engines.
  const translate = useCallback(
    async (reviewId: number) => {
      const response = await fetch(`/api/reviews/translation?review=${reviewId}&locale=${locale}`, {
        cache: 'no-store',
        signal: AbortSignal.timeout(loadTimeoutMs),
      }).catch(() => null)
      if (!response?.ok) return null
      const data = (await response.json().catch(() => null)) as ReviewTranslation | null
      return data?.text ?? null
    },
    [locale],
  )

  const retry = useCallback(() => {
    setStatus('loading')
    void load()
  }, [load])

  return (
    <ReviewsContext
      value={{ app, status, page, loadedAt, loadingMore, moreFailed, loadMore, retry, write, remove, report, translate }}
    >
      {children}
      <ReviewDialog
        open={writing}
        onClose={() => setWriting(false)}
        appName={app.name}
        mine={page?.mine ?? null}
        name={memberName}
        onSubmit={submit}
      />
      <SignInDialog
        open={returnTo !== null}
        onClose={() => {
          wanted.current = false
          setReturnTo(null)
        }}
        title={t('signInTitle')}
        providers={signIn}
        callbackURL={returnTo ?? ''}
        sentNote={t('afterSignIn')}
      />
    </ReviewsContext>
  )
}
