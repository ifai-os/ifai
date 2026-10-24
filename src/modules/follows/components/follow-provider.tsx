'use client'

import { useTranslations } from 'next-intl'
import { createContext, use, useCallback, useEffect, useRef, useState, type ReactNode } from 'react'

import { SignInDialog } from '@/components/auth/sign-in-dialog'
import { authClient } from '@/lib/auth/client'
import type { AuthProviders } from '@/lib/auth/providers'

import { followId, maxFollows, pendingFollowParam, readFollowId, type FollowTarget } from '../target'

/** One target as its buttons show it; `count` is null until it has loaded. */
type Entry = { following: boolean; count: number | null }

/** What the page's corner says when a follow did not go through. */
type Notice = 'tooMany' | 'followFailed' | 'unfollowFailed'

type FollowContextValue = {
  entries: Record<string, Entry>
  /** The target last followed with a button on this page, for the topic page's note. */
  followedHere: string | null
  toggle: (target: FollowTarget) => void
}

const FollowContext = createContext<FollowContextValue | null>(null)

/** One target's follow state from the FollowProvider around the page, for its buttons, count and note. */
export function useFollow(target: FollowTarget) {
  const value = use(FollowContext)
  if (!value) throw new Error('useFollow needs a FollowProvider around it')
  const id = followId(target)
  const entry = value.entries[id]
  return {
    following: entry?.following ?? false,
    count: entry?.count ?? null,
    followedHere: value.followedHere === id,
    toggle: () => value.toggle(target),
  }
}

type FollowProviderProps = {
  /** Every target with a button, count or note on the page; they are read together. */
  targets: readonly FollowTarget[]
  /** The sign-in methods, for the dialog a visitor gets on pressing follow. */
  signIn: AuthProviders
  children: ReactNode
}

/**
 * The follow state of a static page's tags, companies and products (docs/specs/daily.md「关注」),
 * read in the browser in one request so the page itself stays static; every follow button inside
 * shares it. A visitor who presses follow gets the sign-in dialog. Signing in comes back here with
 * ?follow=topic-kimi and the follow is finished then, as it is when they sign in from another tab
 * with the dialog open (the saves' SaveProvider works the same way).
 */
export function FollowProvider({ targets, signIn, children }: FollowProviderProps) {
  const t = useTranslations('follows')
  const { data: session, isPending } = authClient.useSession()
  const signedIn = Boolean(session?.user)
  // One string, so a new array of the same targets does not read them again.
  const ids = [...new Set(targets.map(followId))].join('\n')
  const [entries, setEntries] = useState<Record<string, Entry>>({})
  const [followedHere, setFollowedHere] = useState<string | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)
  /** Where signing in comes back to, while the dialog is open. */
  const [returnTo, setReturnTo] = useState<string | null>(null)
  /** Requests are numbered, and each target shows the answer of the newest request about it. */
  const latest = useRef(0)
  const newest = useRef<Record<string, number>>({})
  const busy = useRef(new Set<string>())
  /** Pressed follow in this tab before signing in. */
  const wanted = useRef<FollowTarget | null>(null)

  const read = useCallback(async () => {
    const list = ids ? ids.split('\n') : []
    if (list.length === 0) return
    const ticket = ++latest.current
    for (const id of list) newest.current[id] = ticket
    const query = new URLSearchParams(list.map((id) => ['t', id]))
    const response = await fetch(`/api/follows?${query}`, { cache: 'no-store' }).catch(() => null)
    const loaded = response?.ok ? ((await response.json()) as { following: string[]; counts: Record<string, number> }) : null
    if (!loaded) return
    const mine = new Set(loaded.following)
    const fresh = list.filter((id) => newest.current[id] === ticket)
    setEntries((current) => ({
      ...current,
      ...Object.fromEntries(fresh.map((id) => [id, { following: mine.has(id), count: loaded.counts[id] ?? 0 }])),
    }))
  }, [ids])

  const askToSignIn = useCallback((target: FollowTarget) => {
    wanted.current = target
    const url = new URL(window.location.href)
    url.searchParams.set(pendingFollowParam, followId(target))
    setReturnTo(url.pathname + url.search)
  }, [])

  /**
   * Follows or unfollows one target and shows the answer. A failure puts the button back as it was
   * (`before`), reads the state again and says so.
   */
  const send = useCallback(
    async (target: FollowTarget, following: boolean, before?: Entry) => {
      const id = followId(target)
      if (busy.current.has(id)) return
      busy.current.add(id)
      const ticket = ++latest.current
      newest.current[id] = ticket
      // Show it at once; the answer (or the failure) puts it right.
      setEntries((current) => {
        const entry = current[id]
        if (entry?.following === following) return current
        const count = entry?.count == null ? null : Math.max(0, entry.count + (following ? 1 : -1))
        return { ...current, [id]: { following, count } }
      })
      const response = await fetch('/api/follows', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type: target.type, key: target.key, following }),
      }).catch(() => null)
      busy.current.delete(id)
      if (response?.ok) {
        const { following: now, count } = (await response.json()) as { following: boolean; count: number }
        if (newest.current[id] === ticket) setEntries((current) => ({ ...current, [id]: { following: now, count } }))
        if (now) setFollowedHere(id)
        return
      }
      const status = response?.status ?? 0
      // Offline, the read below fails too, so the button is put back here.
      if (newest.current[id] === ticket) {
        setEntries((current) => {
          const next = { ...current }
          if (before) next[id] = before
          else delete next[id]
          return next
        })
      }
      void read()
      if (status === 401) askToSignIn(target)
      else setNotice(status === 409 ? 'tooMany' : following ? 'followFailed' : 'unfollowFailed')
    },
    [read, askToSignIn],
  )

  // Once the session is known, and again on signing in or out: read the page's targets, and
  // finish a follow started before signing in.
  useEffect(() => {
    if (isPending) return
    const url = new URL(window.location.href)
    const pending = readFollowId(url.searchParams.get(pendingFollowParam))
    const returned = pending && ids.split('\n').includes(followId(pending)) ? pending : null
    if (returned) {
      url.searchParams.delete(pendingFollowParam)
      window.history.replaceState(null, '', url.pathname + url.search + url.hash)
    }
    void read()
    const target = signedIn ? (returned ?? wanted.current) : null
    if (target) {
      wanted.current = null
      setReturnTo(null)
      void send(target, true)
    }
  }, [isPending, signedIn, ids, read, send])

  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(null), 6000)
    return () => clearTimeout(timer)
  }, [notice])

  const toggle = useCallback(
    (target: FollowTarget) => {
      if (isPending) return
      const entry = entries[followId(target)]
      if (!signedIn) askToSignIn(target)
      else void send(target, !(entry?.following ?? false), entry)
    },
    [isPending, signedIn, entries, askToSignIn, send],
  )

  return (
    <FollowContext value={{ entries, followedHere, toggle }}>
      {children}
      <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-6 z-30 flex justify-center px-4">
        {notice && (
          <p className="pointer-events-auto max-w-full rounded-pill bg-toast px-4 py-3 text-ui text-white shadow-float">
            {t(notice, { max: maxFollows })}
          </p>
        )}
      </div>
      <SignInDialog
        open={returnTo !== null}
        onClose={() => {
          wanted.current = null
          setReturnTo(null)
        }}
        title={t('signInTitle')}
        providers={signIn}
        callbackURL={returnTo ?? ''}
        sentNote={t('afterSignIn')}
      />
    </FollowContext>
  )
}
