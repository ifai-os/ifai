'use client'

import Form from 'next/form'
import { useLocale } from 'next-intl'
import { createContext, use, useEffect, useState, useTransition, type ComponentProps, type ReactNode } from 'react'

import { LoadFailed } from '@/components/states/load-failed'
import { loadTimeoutMs, skeletonDelayMs, type LoadingPhase } from '@/components/states/timing'
import { getPathname, Link, useRouter } from '@/i18n/navigation'

type ListNavigationValue = {
  /** Opens another view of the list (a filter, a sort, a page) and keeps this one on screen meanwhile. */
  go: (href: `/${string}`) => void
  /** How long that has taken, while it is under way: under 300 ms, long enough for a skeleton, or too long. */
  phase: LoadingPhase | null
  retry: () => void
}

const ListNavigationContext = createContext<ListNavigationValue | null>(null)

/** One trip to a new view of the list; `id` restarts the clock. */
type Trip = { href: `/${string}`; id: number; phase: LoadingPhase }

/**
 * Loading states for the Skills list (「空状态与加载状态」board). A `loading.tsx` would swap the whole
 * page for a skeleton and answer 200 for pages that should be 404s (`?page=0`, a page past the
 * end), so the list's own links and search go through here instead: the page stays as it is, and
 * only the results turn into a skeleton after 300 ms, or into「加载失败」after 10 s.
 */
export function ListNavigationProvider({ children }: { children: ReactNode }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [trip, setTrip] = useState<Trip | null>(null)
  const phase = pending && trip ? trip.phase : null

  function go(href: `/${string}`) {
    // Another click while the skeleton shows keeps it and its clock; after「加载失败」the skeleton comes back at once.
    setTrip((current) =>
      current && phase && phase !== 'failed'
        ? { ...current, href }
        : { href, id: (current?.id ?? 0) + 1, phase: phase === 'failed' ? 'skeleton' : 'waiting' },
    )
    startTransition(() => router.push(href))
  }

  const id = trip?.id
  useEffect(() => {
    if (!pending || id === undefined) return
    const advance = (next: LoadingPhase) => setTrip((current) => (current?.id === id ? { ...current, phase: next } : current))
    const showSkeleton = setTimeout(() => advance('skeleton'), skeletonDelayMs)
    const giveUp = setTimeout(() => advance('failed'), loadTimeoutMs)
    return () => {
      clearTimeout(showSkeleton)
      clearTimeout(giveUp)
    }
  }, [pending, id])

  return <ListNavigationContext value={{ go, phase, retry: () => trip && go(trip.href) }}>{children}</ListNavigationContext>
}

type ListLinkProps = Omit<ComponentProps<typeof Link>, 'href' | 'onNavigate'> & { href: `/${string}` }

/** A link to another view of the list. A plain link outside `ListNavigationProvider`, and before the page has loaded. */
export function ListLink({ href, ...props }: ListLinkProps) {
  const navigation = use(ListNavigationContext)
  return (
    <Link
      href={href}
      onNavigate={
        navigation
          ? (event) => {
              event.preventDefault()
              navigation.go(href)
            }
          : undefined
      }
      {...props}
    />
  )
}

type ListSearchProps = Omit<ComponentProps<typeof Form>, 'action' | 'onSubmit'> & { href: `/${string}` }

/** The list's search form: a GET form to `href`, so it works before the page has loaded too. */
export function ListSearch({ href, ...props }: ListSearchProps) {
  const navigation = use(ListNavigationContext)
  const locale = useLocale()
  return (
    <Form
      action={getPathname({ href, locale })}
      onSubmit={(event) => {
        if (!navigation) return
        event.preventDefault()
        const query = new URLSearchParams()
        for (const [name, value] of new FormData(event.currentTarget)) {
          if (typeof value === 'string') query.append(name, value)
        }
        navigation.go(`${href}?${query}`)
      }}
      {...props}
    />
  )
}

type ListResultsProps = {
  /** Shaped like the results, with its own `role="status"`. */
  skeleton: ReactNode
  children: ReactNode
}

/** The results: kept while a new view is on its way, then its skeleton, then「加载失败」with a retry. */
export function ListResults({ skeleton, children }: ListResultsProps) {
  const navigation = use(ListNavigationContext)
  if (navigation?.phase === 'failed') return <LoadFailed onRetry={navigation.retry} />
  if (navigation?.phase === 'skeleton') return skeleton
  return children
}
