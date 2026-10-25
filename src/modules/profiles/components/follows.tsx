'use client'

import { useTranslations } from 'next-intl'
import { createContext, use, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

import { json, request, useCirclesSession } from '@/modules/circles/components/circles-session'

import { profileRules, type FollowChange, type ProfilesError } from '../rules'

/** ?follow=<address>: signing in from「关注」comes back with it, and the follow is made. */
const followParam = 'follow'

type FollowsValue = {
  /** Whether the reader follows them: what they pressed on this page, else what the server said (`known`). */
  following: (handle: string, known: boolean) => boolean
  /** Their followers after the reader's last change on this page, when there was one. */
  followers: (handle: string) => number | undefined
  /** Follows or stops following; a visitor gets the sign-in dialog and follows on coming back. */
  setFollowing: (handle: string, on: boolean) => void
  /** The server said no to the last change: today's limit, or the most anyone can follow. */
  refused: 'daily-limit' | 'too-many' | null
}

const FollowsContext = createContext<FollowsValue | null>(null)

function useFollows(): FollowsValue {
  const value = use(FollowsContext)
  if (!value) throw new Error('useFollows needs a FollowsProvider around it')
  return value
}

type FollowsProviderProps = {
  /** After the server took a change: the circles page reads an empty「关注」again. */
  onChange?: () => void
  children: ReactNode
}

/**
 * Following members (docs/specs/circles.md rule 20) on a page with the circles' session around it:
 * every button for the same person shows the same, the change shows at once and goes back if the
 * server says no. A visitor who presses「关注」signs in and comes back with ?follow=<address>.
 */
export function FollowsProvider({ onChange, children }: FollowsProviderProps) {
  const { member, signedIn, sessionPending, askToSignIn } = useCirclesSession()
  const [pressed, setPressed] = useState<ReadonlyMap<string, boolean>>(new Map())
  const [counts, setCounts] = useState<ReadonlyMap<string, number>>(new Map())
  const [refused, setRefused] = useState<FollowsValue['refused']>(null)
  const memberId = member?.id ?? null
  const shownFor = useRef(memberId)
  const changed = useRef(onChange)
  useEffect(() => {
    changed.current = onChange
  }, [onChange])

  // What one reader pressed is not what the next one did.
  useEffect(() => {
    if (shownFor.current === memberId) return
    shownFor.current = memberId
    setPressed(new Map())
    setCounts(new Map())
  }, [memberId])

  /**
   * Sends a change and shows the server's answer: their new count, or the change undone. A press
   * already shows its change; a follow made on coming back from signing in shows once it is made.
   */
  const send = useCallback(
    (handle: string, on: boolean) =>
      request<FollowChange, ProfilesError>('/api/follows/members', json({ handle, on })).then(({ data, status, error }) => {
        if (data) {
          setPressed((current) => (current.has(handle) ? current : new Map(current).set(handle, on)))
          setCounts((current) => new Map(current).set(handle, data.followers))
          changed.current?.()
          return
        }
        setPressed((current) => new Map(current).set(handle, !on))
        if (status === 401) askToSignIn('follow')
        if (error === 'daily-limit' || error === 'too-many') setRefused(error)
      }),
    [askToSignIn],
  )

  const setFollowing = useCallback(
    (handle: string, on: boolean) => {
      if (sessionPending) return
      if (!signedIn) {
        const url = new URL(window.location.href)
        url.searchParams.set(followParam, handle)
        askToSignIn('follow', url.pathname + url.search + url.hash)
        return
      }
      setRefused(null)
      setPressed((current) => new Map(current).set(handle, on))
      void send(handle, on)
    },
    [sessionPending, signedIn, askToSignIn, send],
  )

  // Back from signing in: follow the person the visitor pressed「关注」for.
  useEffect(() => {
    if (sessionPending) return
    const url = new URL(window.location.href)
    const handle = url.searchParams.get(followParam)
    if (handle === null) return
    url.searchParams.delete(followParam)
    window.history.replaceState(null, '', url.pathname + url.search + url.hash)
    if (signedIn && handle) void send(handle, true)
  }, [sessionPending, signedIn, send])

  const value = useMemo<FollowsValue>(
    () => ({
      following: (handle, known) => pressed.get(handle) ?? known,
      followers: (handle) => counts.get(handle),
      setFollowing,
      refused,
    }),
    [pressed, counts, setFollowing, refused],
  )

  return <FollowsContext value={value}>{children}</FollowsContext>
}

const looks = {
  /** On a post: outlined, small. */
  outline: {
    off: 'h-7.5 border border-line bg-bg px-3 text-small text-ink hover:border-ink-4',
    on: 'h-7.5 border border-surface-2 bg-surface-2 px-3 text-small text-ink-4 hover:text-ink',
  },
  /** In「值得关注的人」and the lists: red, small. */
  accent: {
    off: 'h-7 bg-accent px-3 text-small text-white hover:opacity-90',
    on: 'h-7 bg-surface-2 px-3 text-small text-ink-4 hover:text-ink',
  },
  /** On a member's page. */
  large: {
    off: 'h-9 bg-accent px-4.5 text-ui font-medium text-white hover:opacity-90',
    on: 'h-9 bg-surface-2 px-4.5 text-ui font-medium text-ink-2 hover:text-ink',
  },
} as const

type FollowButtonProps = {
  handle: string
  /** Their name, for screen readers:「关注 林栖」. */
  name: string
  /** What the server said about the reader following them. */
  initial: boolean
  look: keyof typeof looks
}

/** 「关注」, or「已关注」once the reader follows them; pressing again stops following. */
export function FollowButton({ handle, name, initial, look }: FollowButtonProps) {
  const t = useTranslations('profiles')
  const { following, setFollowing, refused } = useFollows()
  const on = following(handle, initial)
  const style = looks[look][on ? 'on' : 'off']
  const [asked, setAsked] = useState(false)
  return (
    <span className="relative inline-flex flex-none">
      <button
        type="button"
        aria-pressed={on}
        aria-label={t('followName', { name })}
        onClick={() => {
          setAsked(true)
          setFollowing(handle, !on)
        }}
        className={`flex flex-none items-center justify-center rounded-btn whitespace-nowrap transition-colors ${style}`}
      >
        {on ? t('following') : t('follow')}
      </button>
      {asked && refused && (
        <span role="alert" className="absolute top-full right-0 z-10 mt-1 w-max max-w-60 rounded-thumb bg-toast px-2.5 py-1.5 text-small text-white">
          {refused === 'daily-limit' ? t('followDailyLimit', { limit: profileRules.dailyFollows }) : t('followTooMany', { max: profileRules.maxFollowing })}
        </span>
      )}
    </span>
  )
}

/** Their followers, counting what the reader just did on this page. */
export function useFollowers(handle: string, initial: number): number {
  const { followers } = useFollows()
  return followers(handle) ?? initial
}
