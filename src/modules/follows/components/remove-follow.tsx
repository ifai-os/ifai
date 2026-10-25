'use client'

import { useTranslations } from 'next-intl'
import { useState, useTransition } from 'react'

import { Icon } from '@/components/icon'
import { useRouter } from '@/i18n/navigation'

import type { FollowTarget } from '../target'

/** The × on a chip of「我的关注」: unfollows, then the page is read again without it and its news. */
export function RemoveFollow({ target, name }: { target: FollowTarget; name: string }) {
  const t = useTranslations('follows')
  const router = useRouter()
  const [status, setStatus] = useState<'idle' | 'busy' | 'failed'>('idle')
  const [refreshing, startTransition] = useTransition()

  async function remove() {
    setStatus('busy')
    const response = await fetch('/api/follows', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...target, following: false }),
    }).catch(() => null)
    if (!response?.ok) {
      setStatus('failed')
      return
    }
    // The chip goes with the fresh page; until then the transition keeps the × disabled.
    setStatus('idle')
    startTransition(() => router.refresh())
  }

  return (
    <>
      <button
        type="button"
        onClick={remove}
        disabled={status === 'busy' || refreshing}
        aria-label={t('removeName', { name })}
        className="flex size-7 flex-none items-center justify-center rounded-pill text-ink-4 transition-colors hover:bg-surface hover:text-ink disabled:opacity-60"
      >
        <Icon name="close" size={14} />
      </button>
      {status === 'failed' && (
        <span role="alert" className="pr-2 text-small text-down">
          {t('unfollowFailed')}
        </span>
      )}
    </>
  )
}
