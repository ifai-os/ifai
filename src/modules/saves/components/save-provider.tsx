'use client'

import { useTranslations } from 'next-intl'
import { createContext, use, useCallback, useEffect, useRef, useState, type ReactNode } from 'react'

import { SignInDialog } from '@/components/auth/sign-in-dialog'
import { authClient } from '@/lib/auth/client'
import type { AuthProviders } from '@/lib/auth/providers'

import { pendingSaveParam, pendingSaveValue, readPendingSave, type SaveTarget } from '../target'

type Loaded = { saved: boolean; count: number }

type SaveContextValue = {
  saved: boolean
  /** How many members have it saved; null until it has loaded. */
  count: number | null
  toggle: () => void
}

const SaveContext = createContext<SaveContextValue | null>(null)

/** The save state from the SaveProvider around the page, for its buttons and counts. */
export function useSave(): SaveContextValue {
  const value = use(SaveContext)
  if (!value) throw new Error('useSave needs a SaveProvider around it')
  return value
}

type SaveProviderProps = {
  target: SaveTarget
  /** The sign-in methods, for the dialog a visitor gets on pressing save. */
  signIn: AuthProviders
  children: ReactNode
}

/**
 * The save state of one thing on a static page, read in the browser so the page itself stays
 * static (docs/specs/apps.md「页面与路由」); every save button and count inside shares it. A
 * visitor who presses save gets the sign-in dialog. Signing in comes back here with ?save=app-12
 * and the save is finished then, as it is when they sign in from another tab with the dialog open.
 */
export function SaveProvider({ target, signIn, children }: SaveProviderProps) {
  const t = useTranslations('saves')
  const { data: session, isPending } = authClient.useSession()
  const signedIn = Boolean(session?.user)
  const { type, id } = target
  const [state, setState] = useState<Loaded | null>(null)
  const [busy, setBusy] = useState(false)
  /** Where signing in comes back to, while the dialog is open. */
  const [returnTo, setReturnTo] = useState<string | null>(null)
  /** Only the newest request's answer is shown. */
  const latest = useRef(0)
  /** Pressed save in this tab before signing in. */
  const wanted = useRef(false)

  /** Reads the state (no `saved`) or sets it, and shows the answer; resolves to the HTTP status, 0 when offline. */
  const send = useCallback(
    async (saved?: boolean) => {
      const ticket = ++latest.current
      const response = await fetch(
        saved === undefined ? `/api/saves?type=${type}&id=${id}` : '/api/saves',
        saved === undefined
          ? { cache: 'no-store' }
          : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type, id, saved }) },
      ).catch(() => null)
      const loaded = response?.ok ? ((await response.json()) as Loaded) : null
      if (loaded && ticket === latest.current) setState({ saved: loaded.saved, count: loaded.count })
      return response?.status ?? 0
    },
    [type, id],
  )

  const askToSignIn = useCallback(() => {
    wanted.current = true
    const url = new URL(window.location.href)
    url.searchParams.set(pendingSaveParam, pendingSaveValue({ type, id }))
    setReturnTo(url.pathname + url.search)
  }, [type, id])

  const save = useCallback(
    async (saved: boolean) => {
      setBusy(true)
      // Show it at once; the answer (or a fresh read, if it failed) puts it right.
      setState((current) =>
        current && current.saved !== saved ? { saved, count: Math.max(0, current.count + (saved ? 1 : -1)) } : current,
      )
      const status = await send(saved)
      setBusy(false)
      if (status === 200) return
      void send()
      if (status === 401) askToSignIn()
    },
    [send, askToSignIn],
  )

  // Once the session is known, and again on signing in or out: finish a save started before
  // signing in, or just read the state.
  useEffect(() => {
    if (isPending) return
    const url = new URL(window.location.href)
    const pending = readPendingSave(url.searchParams.get(pendingSaveParam))
    const returned = pending?.type === type && pending.id === id
    if (returned) {
      url.searchParams.delete(pendingSaveParam)
      window.history.replaceState(null, '', url.pathname + url.search + url.hash)
    }
    if (signedIn && (returned || wanted.current)) {
      wanted.current = false
      setReturnTo(null)
      void save(true)
    } else {
      void send()
    }
  }, [isPending, signedIn, type, id, save, send])

  const toggle = useCallback(() => {
    if (busy || isPending) return
    if (!signedIn) askToSignIn()
    else void save(!(state?.saved ?? false))
  }, [busy, isPending, signedIn, state, askToSignIn, save])

  return (
    <SaveContext value={{ saved: state?.saved ?? false, count: state?.count ?? null, toggle }}>
      {children}
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
    </SaveContext>
  )
}
