'use client'

import { useTranslations } from 'next-intl'
import { createContext, use, useCallback, useMemo, useState, type ReactNode } from 'react'

import { SignInDialog } from '@/components/auth/sign-in-dialog'
import { loadTimeoutMs } from '@/components/states/timing'
import { authClient } from '@/lib/auth/client'
import type { AuthProviders } from '@/lib/auth/providers'

import type { MemberReportReason } from '@/modules/profiles/rules'

import type { CircleView, CirclesError, MemberReportTarget, ReportReason, ReportTarget } from '../rules'

/** What a visitor pressed before being asked to sign in: it names the dialog. */
export type SignInReason = 'join' | 'post' | 'react' | 'comment' | 'follow' | 'block'

type CirclesSessionValue = {
  circles: CircleView[]
  byId: ReadonlyMap<number, CircleView>
  signedIn: boolean
  /** The session is still being read: buttons wait. */
  sessionPending: boolean
  member: { id: string; name: string } | null
  /** The sign-in dialog; signing in comes back to `returnTo` (this page by default). */
  askToSignIn: (reason: SignInReason, returnTo?: string) => void
  /** A post or a comment with the reasons for them, or a member with theirs (the server checks the pair). */
  report: (target: ReportTarget | MemberReportTarget, reason: ReportReason | MemberReportReason) => Promise<boolean>
}

const CirclesSessionContext = createContext<CirclesSessionValue | null>(null)

/** The reader, the circles and the sign-in dialog, from the CirclesSessionProvider around the page. */
export function useCirclesSession(): CirclesSessionValue {
  const value = use(CirclesSessionContext)
  if (!value) throw new Error('useCirclesSession needs a CirclesSessionProvider around it')
  return value
}

export async function request<T, E extends string = CirclesError>(
  url: string,
  init?: RequestInit,
): Promise<{ status: number; data: T | null; error?: E }> {
  const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(loadTimeoutMs), ...init }).catch(() => null)
  if (!response) return { status: 0, data: null }
  const data = (await response.json().catch(() => null)) as (T & { error?: E }) | null
  return response.ok && data ? { status: response.status, data } : { status: response.status, data: null, error: data?.error }
}

export const json = (body: object, method = 'POST'): RequestInit => ({
  method,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
})

type CirclesSessionProviderProps = {
  circles: CircleView[]
  signIn: AuthProviders
  /** Under the sign-in dialog's「sent」note: where signing in comes back to. */
  afterSignIn: string
  children: ReactNode
}

/**
 * What the circles page, a post's page and members' pages share (docs/specs/circles.md): the
 * circles readers can see, who is reading, the sign-in dialog for a visitor who pressed something
 * only members can do, and reporting a post, a comment or a member.
 */
export function CirclesSessionProvider({ circles, signIn, afterSignIn, children }: CirclesSessionProviderProps) {
  const t = useTranslations('circles')
  const { data: session, isPending } = authClient.useSession()
  const [signInReason, setSignInReason] = useState<SignInReason | null>(null)
  const [returnTo, setReturnTo] = useState('')
  const byId = useMemo(() => new Map(circles.map((circle) => [circle.id, circle])), [circles])
  const userId = session?.user.id
  const userName = session?.user.name ?? ''
  const member = useMemo(() => (userId ? { id: userId, name: userName } : null), [userId, userName])

  const askToSignIn = useCallback((reason: SignInReason, back?: string) => {
    setReturnTo(back ?? window.location.pathname + window.location.search + window.location.hash)
    setSignInReason(reason)
  }, [])

  const report = useCallback(async (target: ReportTarget | MemberReportTarget, reason: ReportReason | MemberReportReason) => {
    const body = target.kind === 'member' ? { member: target.handle, reason } : { [target.kind]: target.id, reason }
    const { data } = await request<{ reported: boolean }>('/api/circles/report', json(body))
    return Boolean(data)
  }, [])

  const titles: Record<SignInReason, string> = {
    join: t('signInJoin'),
    post: t('signInPost'),
    react: t('signInReact'),
    comment: t('signInComment'),
    follow: t('signInFollow'),
    block: t('signInBlock'),
  }

  return (
    <CirclesSessionContext
      value={{ circles, byId, signedIn: Boolean(member), sessionPending: isPending, member, askToSignIn, report }}
    >
      {children}
      <SignInDialog
        open={signInReason !== null}
        onClose={() => setSignInReason(null)}
        title={signInReason ? titles[signInReason] : ''}
        providers={signIn}
        callbackURL={returnTo}
        sentNote={afterSignIn}
      />
    </CirclesSessionContext>
  )
}
