'use client'

import { useEffect, useState, type ReactNode } from 'react'

import { LoadFailed } from '@/components/states/load-failed'
import { CardSkeleton, ListSkeleton } from '@/components/states/skeleton'
import { loadTimeoutMs, skeletonDelayMs, type LoadingPhase } from '@/components/states/timing'
import { useRouter } from '@/i18n/navigation'

type LoadingStateProps = {
  kind?: 'list' | 'cards'
  /** Rows (list) or cards to draw. Match the real list so the page does not jump. */
  count?: number
  /** A skeleton shaped like the page instead (a Skill's page, say), with its own `role="status"`. */
  skeleton?: ReactNode
  /** Defaults to re-fetching the current route. */
  onRetry?: () => void
}

/**
 * Loading UI for a `loading.tsx` or a Suspense fallback. Holds the space from
 * the start, shows the shimmer after 300 ms, and gives up after 10 s with
 *「加载失败，点此重试」.
 */
export function LoadingState({ kind = 'list', count, skeleton, onRetry }: LoadingStateProps) {
  const router = useRouter()
  const [phase, setPhase] = useState<LoadingPhase>('waiting')

  useEffect(() => {
    const showSkeleton = setTimeout(() => setPhase('skeleton'), skeletonDelayMs)
    const giveUp = setTimeout(() => setPhase('failed'), loadTimeoutMs)
    return () => {
      clearTimeout(showSkeleton)
      clearTimeout(giveUp)
    }
  }, [])

  if (phase === 'failed') return <LoadFailed onRetry={onRetry ?? (() => router.refresh())} />

  return (
    <div aria-busy="true" className={phase === 'waiting' ? 'invisible' : undefined}>
      {skeleton ?? (kind === 'cards' ? <CardSkeleton count={count} /> : <ListSkeleton rows={count} />)}
    </div>
  )
}
