'use client'

import { useLocale, useTranslations } from 'next-intl'
import { useSearchParams } from 'next/navigation'
import { createContext, use, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

import { SignInDialog } from '@/components/auth/sign-in-dialog'
import { loadTimeoutMs } from '@/components/states/timing'
import type { Locale } from '@/i18n/config'
import { useRouter } from '@/i18n/navigation'
import { authClient } from '@/lib/auth/client'
import type { AuthProviders } from '@/lib/auth/providers'

import {
  parseTab,
  toggleReaction,
  type CircleView,
  type CirclesChange,
  type CirclesError,
  type CirclesOverview,
  type FeedPage,
  type FeedTab,
  type PostView,
  type Reaction,
  type ReactionView,
  type ReportReason,
} from '../rules'

type Status = 'loading' | 'ready' | 'failed'

/** A first page and what came after it, for one tab, circle and reader (`key`). */
type Feed = { key: string; posts: PostView[]; next: number | null; loadedAt: number }

/** What sending the post form came to: done, or why not. */
export type PublishResult = 'ok' | 'sign-in' | 'failed' | CirclesError

/** What a visitor pressed before being asked to sign in: it names the dialog. */
type SignInReason = 'join' | 'post' | 'react'

type CirclesContextValue = {
  circles: CircleView[]
  byId: ReadonlyMap<number, CircleView>
  overview: CirclesOverview
  /** The circles the member joined; empty for a visitor and until the first page arrives. */
  joined: number[]
  signedIn: boolean
  /** The session is still being read: buttons wait. */
  sessionPending: boolean
  member: { id: string; name: string } | null
  tab: FeedTab
  /** The circle the feed is narrowed to (?circle=<slug>), when it is one readers can see. */
  circle: CircleView | null
  status: Status
  posts: PostView[]
  hasMore: boolean
  loadingMore: boolean
  moreFailed: boolean
  /** When the feed was loaded, for「3 小时前」. */
  loadedAt: number
  setTab: (tab: FeedTab) => void
  loadMore: () => void
  retry: () => void
  /** Joins or leaves; a visitor gets the sign-in dialog and joins on coming back. */
  join: (circle: CircleView, joined: boolean) => Promise<boolean>
  publish: (circleId: number, body: string) => Promise<PublishResult>
  remove: (postId: number) => Promise<boolean>
  react: (post: PostView, reaction: Reaction, on: boolean) => void
  report: (postId: number, reason: ReportReason) => Promise<boolean>
  askToSignIn: (reason: SignInReason) => void
}

const CirclesContext = createContext<CirclesContextValue | null>(null)

/** The circles page's state from the CirclesProvider around it. */
export function useCircles(): CirclesContextValue {
  const value = use(CirclesContext)
  if (!value) throw new Error('useCircles needs a CirclesProvider around it')
  return value
}

/** ?join=<slug>: signing in from「加入」comes back with it, and the circle is joined. */
const joinParam = 'join'

async function request<T>(url: string, init?: RequestInit): Promise<{ status: number; data: T | null; error?: CirclesError }> {
  const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(loadTimeoutMs), ...init }).catch(() => null)
  if (!response) return { status: 0, data: null }
  const data = (await response.json().catch(() => null)) as (T & { error?: CirclesError }) | null
  return response.ok && data ? { status: response.status, data } : { status: response.status, data: null, error: data?.error }
}

const json = (body: object, method = 'POST'): RequestInit => ({
  method,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
})

type CirclesProviderProps = {
  circles: CircleView[]
  /** The numbers the page was rendered with; the first page of the feed brings fresh ones. */
  overview: CirclesOverview
  signIn: AuthProviders
  children: ReactNode
}

/**
 * The circles page (docs/specs/circles.md): the feed, the circles' numbers and the reader's
 * circles, read in the browser. The tab and the circle live in the address (?tab=latest,
 * ?circle=ai-art), so they survive a reload and a shared link. A visitor who presses「加入」
 * gets the sign-in dialog and comes back with ?join=<slug>, which joins the circle.
 */
export function CirclesProvider({ circles, overview: initialOverview, signIn, children }: CirclesProviderProps) {
  const t = useTranslations('circles')
  const locale = useLocale() as Locale
  const router = useRouter()
  const searchParams = useSearchParams()
  const { data: session, isPending } = authClient.useSession()
  const signedIn = Boolean(session?.user)
  const member = session?.user ? { id: session.user.id, name: session.user.name ?? '' } : null

  const byId = useMemo(() => new Map(circles.map((circle) => [circle.id, circle])), [circles])
  const slug = searchParams.get('circle')
  const circle = (slug && circles.find((item) => item.slug === slug)) || null
  // 我的圈子 is every circle the reader joined; inside one circle it is just 推荐.
  const asked = parseTab(searchParams.get('tab')) ?? 'hot'
  const tab = circle && asked === 'mine' ? 'hot' : asked

  const [overview, setOverview] = useState(initialOverview)
  const [joined, setJoined] = useState<number[]>([])
  const [feed, setFeed] = useState<Feed | null>(null)
  const [failedKey, setFailedKey] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [moreFailed, setMoreFailed] = useState(false)
  const [signInReason, setSignInReason] = useState<SignInReason | null>(null)
  const [returnTo, setReturnTo] = useState('')
  /** Only the newest first-page request's answer is shown. */
  const latest = useRef(0)

  const feedUrl = useCallback(
    (cursor: number | null) => {
      const params = new URLSearchParams({ tab })
      if (circle) params.set('circle', String(circle.id))
      if (cursor) params.set('cursor', String(cursor))
      return `/api/circles/feed?${params}`
    },
    [tab, circle],
  )

  // The feed on screen is the one for this tab, circle and reader; until it arrives, the skeleton.
  // A failed reload of the same feed keeps what is on screen.
  const key = `${member?.id ?? ''} ${feedUrl(null)}`
  const current = feed?.key === key ? feed : null
  const status: Status = current ? 'ready' : failedKey === key ? 'failed' : 'loading'

  const applyChange = useCallback((change: CirclesChange) => {
    setOverview(change.overview)
    setJoined(change.joined)
  }, [])

  const setPosts = useCallback((change: (posts: PostView[]) => PostView[]) => {
    setFeed((shown) => (shown ? { ...shown, posts: change(shown.posts) } : shown))
  }, [])

  /** Reads the first page and shows it when it arrives, unless a newer read started meanwhile. */
  const load = useCallback(() => {
    const ticket = ++latest.current
    return request<FeedPage>(feedUrl(null)).then(({ data }) => {
      if (ticket !== latest.current) return
      if (!data) {
        setFailedKey(key)
        return
      }
      setFeed({ key, posts: data.posts, next: data.next, loadedAt: Date.now() })
      if (data.overview) setOverview(data.overview)
      if (data.joined) setJoined(data.joined)
      setMoreFailed(false)
    })
  }, [feedUrl, key])

  const join = useCallback(
    async (target: CircleView, wanted: boolean) => {
      if (isPending) return false
      if (!signedIn) {
        const url = new URL(window.location.href)
        url.searchParams.set(joinParam, target.slug)
        setReturnTo(url.pathname + url.search)
        setSignInReason('join')
        return false
      }
      // Shown at once; put back if the server says no.
      setJoined((current) => (wanted ? [...new Set([...current, target.id])] : current.filter((id) => id !== target.id)))
      const { data } = await request<CirclesChange>('/api/circles/members', json({ circle: target.id, joined: wanted }))
      if (data) applyChange(data)
      else setJoined((current) => (wanted ? current.filter((id) => id !== target.id) : [...new Set([...current, target.id])]))
      return Boolean(data)
    },
    [isPending, signedIn, applyChange],
  )

  // Once the session is known, and again on signing in or out or changing the tab or circle:
  // read the feed, and finish a「加入」started before signing in.
  useEffect(() => {
    if (isPending) return
    const url = new URL(window.location.href)
    const pending = url.searchParams.get(joinParam)
    if (pending !== null) {
      url.searchParams.delete(joinParam)
      window.history.replaceState(null, '', url.pathname + url.search + url.hash)
    }
    const target = signedIn && pending ? circles.find((item) => item.slug === pending) : undefined
    // The join waits for the feed, whose list of joined circles would otherwise undo it.
    void load().then(() => target && join(target, true))
  }, [isPending, signedIn, load, circles, join])

  const setTab = useCallback(
    (nextTab: FeedTab) => {
      const query: Record<string, string> = {}
      if (nextTab !== 'hot') query.tab = nextTab
      if (circle) query.circle = circle.slug
      router.replace({ pathname: '/circles', query }, { scroll: false })
    },
    [router, circle],
  )

  const next = current?.next ?? null
  const loadMore = useCallback(async () => {
    if (!next || loadingMore) return
    setLoadingMore(true)
    setMoreFailed(false)
    const { data } = await request<FeedPage>(feedUrl(next))
    setLoadingMore(false)
    if (!data) {
      setMoreFailed(true)
      return
    }
    // 推荐 pages by position: a post that moved up meanwhile comes again, once is enough.
    setFeed((shown) => {
      if (!shown || shown.key !== key) return shown
      const seen = new Set(shown.posts.map((post) => post.id))
      return { ...shown, posts: [...shown.posts, ...data.posts.filter((post) => !seen.has(post.id))], next: data.next }
    })
  }, [next, loadingMore, feedUrl, key])

  const askToSignIn = useCallback((reason: SignInReason) => {
    setReturnTo(window.location.pathname + window.location.search)
    setSignInReason(reason)
  }, [])

  const publish = useCallback(
    async (circleId: number, body: string): Promise<PublishResult> => {
      const result = await request<CirclesChange>('/api/circles/posts', json({ circle: circleId, body, locale }))
      if (result.status === 401) {
        askToSignIn('post')
        return 'sign-in'
      }
      if (!result.data) return result.error ?? 'failed'
      applyChange(result.data)
      const post = result.data.post
      // Their post at the top of「最新」: here at once when that is the feed, otherwise the feed switches to it.
      if (tab === 'latest' && (!circle || circle.id === circleId)) {
        if (post) setPosts((shown) => [post, ...shown.filter((item) => item.id !== post.id)])
      } else {
        const query: Record<string, string> = { tab: 'latest' }
        if (circle && circle.id === circleId) query.circle = circle.slug
        router.replace({ pathname: '/circles', query }, { scroll: false })
      }
      return 'ok'
    },
    [locale, tab, circle, router, applyChange, askToSignIn, setPosts],
  )

  const remove = useCallback(
    async (postId: number) => {
      const { data } = await request<CirclesChange>(`/api/circles/posts?id=${postId}`, { method: 'DELETE' })
      if (!data) return false
      applyChange(data)
      setPosts((shown) => shown.filter((post) => post.id !== postId))
      return true
    },
    [applyChange, setPosts],
  )

  const setReactions = useCallback(
    (postId: number, reactions: ReactionView[]) => {
      setPosts((shown) => shown.map((post) => (post.id === postId ? { ...post, reactions } : post)))
    },
    [setPosts],
  )

  const react = useCallback(
    (post: PostView, reaction: Reaction, on: boolean) => {
      if (isPending) return
      if (!signedIn) {
        askToSignIn('react')
        return
      }
      const before = post.reactions
      setReactions(post.id, toggleReaction(before, reaction, on))
      void request<{ reactions: ReactionView[] }>('/api/circles/reactions', json({ post: post.id, reaction, on })).then(({ data, status }) => {
        if (data) setReactions(post.id, data.reactions)
        else {
          setReactions(post.id, before)
          if (status === 401) askToSignIn('react')
        }
      })
    },
    [isPending, signedIn, askToSignIn, setReactions],
  )

  const report = useCallback(async (postId: number, reason: ReportReason) => {
    const { data } = await request<{ reported: boolean }>('/api/circles/report', json({ post: postId, reason }))
    return Boolean(data)
  }, [])

  const retry = useCallback(() => {
    setFailedKey(null)
    void load()
  }, [load])

  const titles: Record<SignInReason, string> = { join: t('signInJoin'), post: t('signInPost'), react: t('signInReact') }

  return (
    <CirclesContext
      value={{
        circles,
        byId,
        overview,
        joined,
        signedIn,
        sessionPending: isPending,
        member,
        tab,
        circle,
        status,
        posts: current?.posts ?? [],
        hasMore: next !== null,
        loadingMore,
        moreFailed,
        loadedAt: current?.loadedAt ?? 0,
        setTab,
        loadMore,
        retry,
        join,
        publish,
        remove,
        react,
        report,
        askToSignIn,
      }}
    >
      {children}
      <SignInDialog
        open={signInReason !== null}
        onClose={() => setSignInReason(null)}
        title={signInReason ? titles[signInReason] : ''}
        providers={signIn}
        callbackURL={returnTo}
        sentNote={t('afterSignIn')}
      />
    </CirclesContext>
  )
}
