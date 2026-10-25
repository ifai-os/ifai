'use client'

import { useLocale } from 'next-intl'
import { useSearchParams } from 'next/navigation'
import { createContext, use, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

import type { Locale } from '@/i18n/config'
import { useRouter } from '@/i18n/navigation'
import { FollowsProvider } from '@/modules/profiles/components/follows'

import {
  parseTab,
  shownTab,
  type CircleView,
  type CirclesChange,
  type CirclesError,
  type CirclesOverview,
  type FeedPage,
  type FeedTab,
  type PostView,
  type ReactionView,
  type VideoView,
} from '../rules'
import { json, request, useCirclesSession } from './circles-session'
import { PostActionsContext, useReact } from './post-actions'

type Status = 'loading' | 'ready' | 'failed'

/** A first page and what came after it, for one tab, circle and reader (`key`); `follows` on 关注. */
type Feed = { key: string; posts: PostView[]; next: number | null; loadedAt: number; follows: number | null }

/** What sending the post form came to: done, or why not. */
export type PublishResult = 'ok' | 'sign-in' | 'failed' | CirclesError

/** What the post carries besides its text: uploaded pictures in order, a looked-up video. */
export type PostMedia = { images: number[]; video: number | null }

export type UploadResult = { ok: true; id: number } | { ok: false; error: 'sign-in' | 'failed' | CirclesError }

export type VideoResult = { ok: true; video: VideoView } | { ok: false; error: 'sign-in' | 'failed' | CirclesError }

/** Pictures can take a while on a phone; reading a video's site too. */
const uploadTimeoutMs = 60_000
const videoTimeoutMs = 30_000

type CirclesContextValue = ReturnType<typeof useCirclesSession> & {
  overview: CirclesOverview
  /** The circles the member joined; empty for a visitor and until the first page arrives. */
  joined: number[]
  tab: FeedTab
  /** The circle the feed is narrowed to (?circle=<slug>), when it is one readers can see. */
  circle: CircleView | null
  status: Status
  posts: PostView[]
  /** On 关注: how many people the reader follows, for what an empty feed says. */
  follows: number | null
  hasMore: boolean
  loadingMore: boolean
  moreFailed: boolean
  setTab: (tab: FeedTab) => void
  loadMore: () => void
  retry: () => void
  /** Joins or leaves; a visitor gets the sign-in dialog and joins on coming back. */
  join: (circle: CircleView, joined: boolean) => Promise<boolean>
  publish: (circleId: number, body: string, media: PostMedia) => Promise<PublishResult>
  /** Sends one picture for the post being written. */
  uploadImage: (file: Blob) => Promise<UploadResult>
  /** The card for a pasted video link. */
  lookUpVideo: (url: string) => Promise<VideoResult>
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

type CirclesProviderProps = {
  /** The numbers the page was rendered with; the first page of the feed brings fresh ones. */
  overview: CirclesOverview
  children: ReactNode
}

/**
 * The circles page (docs/specs/circles.md): the feed, the circles' numbers and the reader's
 * circles, read in the browser, inside the CirclesSessionProvider. The tab and the circle live
 * in the address (?tab=latest, ?circle=ai-art), so they survive a reload and a shared link. A
 * visitor who presses「加入」gets the sign-in dialog and comes back with ?join=<slug>, which joins the circle.
 */
export function CirclesProvider({ overview: initialOverview, children }: CirclesProviderProps) {
  const locale = useLocale() as Locale
  const router = useRouter()
  const searchParams = useSearchParams()
  const session = useCirclesSession()
  const { circles, signedIn, sessionPending: isPending, member, askToSignIn } = session

  const slug = searchParams.get('circle')
  const circle = (slug && circles.find((item) => item.slug === slug)) || null
  const tab = shownTab(parseTab(searchParams.get('tab')) ?? 'hot', circle !== null)

  const [overview, setOverview] = useState(initialOverview)
  const [joined, setJoined] = useState<number[]>([])
  const [feed, setFeed] = useState<Feed | null>(null)
  const [failedKey, setFailedKey] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [moreFailed, setMoreFailed] = useState(false)
  /** Only the newest first-page request's answer is shown. */
  const latest = useRef(0)

  const feedUrl = useCallback(
    (cursor: number | null) => {
      const params = new URLSearchParams({ tab, locale })
      if (circle) params.set('circle', String(circle.id))
      if (cursor) params.set('cursor', String(cursor))
      return `/api/circles/feed?${params}`
    },
    [tab, circle, locale],
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
      setFeed({ key, posts: data.posts, next: data.next, loadedAt: Date.now(), follows: data.follows ?? null })
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
        askToSignIn('join', url.pathname + url.search)
        return false
      }
      // Shown at once; put back if the server says no.
      setJoined((current) => (wanted ? [...new Set([...current, target.id])] : current.filter((id) => id !== target.id)))
      const { data } = await request<CirclesChange>('/api/circles/members', json({ circle: target.id, joined: wanted }))
      if (data) applyChange(data)
      else setJoined((current) => (wanted ? current.filter((id) => id !== target.id) : [...new Set([...current, target.id])]))
      return Boolean(data)
    },
    [isPending, signedIn, applyChange, askToSignIn],
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

  const publish = useCallback(
    async (circleId: number, body: string, media: PostMedia): Promise<PublishResult> => {
      const result = await request<CirclesChange>('/api/circles/posts', json({ circle: circleId, body, locale, ...media }))
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

  const uploadImage = useCallback(
    async (file: Blob): Promise<UploadResult> => {
      const form = new FormData()
      form.set('file', file)
      const { data, status, error } = await request<{ image: { id: number } }>('/api/circles/images', {
        method: 'POST',
        body: form,
        signal: AbortSignal.timeout(uploadTimeoutMs),
      })
      if (data) return { ok: true, id: data.image.id }
      if (status === 401) askToSignIn('post')
      return { ok: false, error: status === 401 ? 'sign-in' : (error ?? 'failed') }
    },
    [askToSignIn],
  )

  const lookUpVideo = useCallback(
    async (url: string): Promise<VideoResult> => {
      const { data, status, error } = await request<{ video: VideoView }>('/api/circles/videos', {
        ...json({ url }),
        signal: AbortSignal.timeout(videoTimeoutMs),
      })
      if (data) return { ok: true, video: data.video }
      if (status === 401) askToSignIn('post')
      return { ok: false, error: status === 401 ? 'sign-in' : (error ?? 'failed') }
    },
    [askToSignIn],
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

  const react = useReact(setReactions)
  const loadedAt = current?.loadedAt ?? 0
  const actions = useMemo(() => ({ loadedAt, react, remove }), [loadedAt, react, remove])

  const retry = useCallback(() => {
    setFailedKey(null)
    void load()
  }, [load])

  // Following someone from an empty 关注 (on a post elsewhere, or in「值得关注的人」) brings their posts.
  const emptyFollowing = tab === 'following' && current !== null && current.posts.length === 0
  const onFollowsChange = useCallback(() => {
    if (emptyFollowing) void load()
  }, [emptyFollowing, load])

  return (
    <CirclesContext
      value={{
        ...session,
        overview,
        joined,
        tab,
        circle,
        status,
        posts: current?.posts ?? [],
        follows: current?.follows ?? null,
        hasMore: next !== null,
        loadingMore,
        moreFailed,
        setTab,
        loadMore,
        retry,
        join,
        publish,
        uploadImage,
        lookUpVideo,
      }}
    >
      <PostActionsContext value={actions}>
        <FollowsProvider onChange={onFollowsChange}>{children}</FollowsProvider>
      </PostActionsContext>
    </CirclesContext>
  )
}
