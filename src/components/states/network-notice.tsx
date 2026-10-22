'use client'

import { useTranslations } from 'next-intl'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'

import { Icon } from '@/components/icon'
import { networkView, restoredVisibleMs, retrySpinMs, type NetworkPhase } from '@/components/states/network-view'
import { useRouter } from '@/i18n/navigation'

function subscribeOnline(callback: () => void) {
  window.addEventListener('online', callback)
  window.addEventListener('offline', callback)
  return () => {
    window.removeEventListener('online', callback)
    window.removeEventListener('offline', callback)
  }
}

/**
 * Floating pill at the bottom of every page (from the「空状态与加载状态」board):
 * offline → retry; back online → refresh the route and say so. Loaded content
 * stays readable; nothing the user is typing is cleared.
 */
export function NetworkNotice() {
  const t = useTranslations('states')
  const router = useRouter()
  const online = useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  )
  const [phase, setPhase] = useState<NetworkPhase>('idle')
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  function schedule(callback: () => void, ms: number) {
    clearTimeout(timer.current)
    timer.current = setTimeout(callback, ms)
  }

  function restored() {
    setPhase('restored')
    router.refresh()
    schedule(() => setPhase('idle'), restoredVisibleMs)
  }

  useEffect(() => {
    const onOnline = () => restored()
    const onOffline = () => {
      clearTimeout(timer.current)
      setPhase('idle')
    }
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
      clearTimeout(timer.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `restored` only reads refs and setters.
  }, [])

  function retry() {
    setPhase('reconnecting')
    schedule(() => {
      if (navigator.onLine) restored()
      else setPhase('idle')
    }, retrySpinMs)
  }

  function cancel() {
    clearTimeout(timer.current)
    setPhase('idle')
  }

  const view = networkView(online, phase)
  const action = view === 'offline' ? retry : cancel
  const actionLabel = view === 'offline' ? t('reconnect') : view === 'reconnecting' ? t('cancel') : t('dismiss')

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-6 z-30 flex justify-center px-4"
    >
      {view !== 'hidden' && (
        <div
          className={`pointer-events-auto flex min-h-12 max-w-full items-center gap-2.5 rounded-pill py-1.5 pr-1.5 pl-4 text-ui text-white shadow-float ${view === 'restored' ? 'bg-success-ink' : 'bg-toast'}`}
        >
          {view === 'offline' && <Icon name="offline" size={18} />}
          {view === 'reconnecting' && (
            <span
              aria-hidden="true"
              className="size-3.5 flex-none animate-spin rounded-pill border-2 border-white/35 border-t-white motion-reduce:animate-none"
            />
          )}
          {view === 'restored' && <Icon name="check" size={18} strokeWidth={2} />}
          <span>{t(view)}</span>
          <button
            type="button"
            onClick={action}
            className="h-9 rounded-pill bg-white/16 px-3.5 text-meta font-medium whitespace-nowrap transition-colors hover:bg-white/24"
          >
            {actionLabel}
          </button>
        </div>
      )}
    </div>
  )
}
