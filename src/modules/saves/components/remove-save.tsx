'use client'

import { useTranslations } from 'next-intl'
import { useState, useTransition } from 'react'

import { useRouter } from '@/i18n/navigation'

import type { SaveTarget } from '../target'

/** 取消收藏 on「我的收藏」: unsaves, then the page is read again without it. */
export function RemoveSave({ target, name }: { target: SaveTarget; name: string }) {
  const t = useTranslations('saves')
  const router = useRouter()
  const [status, setStatus] = useState<'idle' | 'busy' | 'failed'>('idle')
  const [refreshing, startTransition] = useTransition()

  async function remove() {
    setStatus('busy')
    const response = await fetch('/api/saves', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...target, saved: false }),
    }).catch(() => null)
    if (!response?.ok) {
      setStatus('failed')
      return
    }
    startTransition(() => router.refresh())
  }

  return (
    <div className="flex flex-none flex-col items-end gap-1">
      <button
        type="button"
        onClick={remove}
        disabled={status === 'busy' || refreshing}
        aria-label={t('removeName', { name })}
        className="inline-flex h-8 items-center rounded-btn border border-line bg-bg px-3 text-meta font-medium whitespace-nowrap text-ink transition-colors hover:border-ink-4 disabled:opacity-60"
      >
        {t('remove')}
      </button>
      {status === 'failed' && (
        <span role="alert" className="text-small text-down">
          {t('failed')}
        </span>
      )}
    </div>
  )
}
