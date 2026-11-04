'use client'

import { useLocale } from 'next-intl'
import { useCallback, useEffect, useRef } from 'react'

import type { TurnstileAction } from '@/lib/turnstile'

/**
 * Cloudflare Turnstile for a form (docs/specs/security.md「Turnstile」). The widget stays out of
 * sight unless Cloudflare wants the reader to tick a box, and asks for a token only when the form
 * is sent. Without NEXT_PUBLIC_TURNSTILE_SITE_KEY nothing loads and `token()` gives null.
 */

type Turnstile = {
  render: (container: HTMLElement, options: Record<string, unknown>) => string
  execute: (widgetId: string) => void
  reset: (widgetId: string) => void
  remove: (widgetId: string) => void
}

declare global {
  interface Window {
    turnstile?: Turnstile
  }
}

const SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
/** How long to wait for a pass, including a reader ticking the box, before the form says it failed. */
const WAIT_MS = 60_000

const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() || null

/** Turnstile's own language codes for our five. */
const languages: Record<string, string> = { en: 'en', 'zh-Hans': 'zh-cn', 'zh-Hant': 'zh-tw', ja: 'ja', ko: 'ko' }

let loading: Promise<Turnstile> | null = null

function loadTurnstile(): Promise<Turnstile> {
  if (window.turnstile) return Promise.resolve(window.turnstile)
  loading ??= new Promise<Turnstile>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = SCRIPT
    script.async = true
    script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('turnstile')))
    script.onerror = () => {
      loading = null
      script.remove()
      reject(new Error('turnstile'))
    }
    document.head.appendChild(script)
  })
  return loading
}

export function useTurnstile(action: TurnstileAction) {
  const locale = useLocale()
  const container = useRef<HTMLDivElement>(null)
  const widget = useRef<{ api: Turnstile; id: string; node: HTMLElement } | null>(null)
  const pending = useRef<((token: string | null) => void) | null>(null)

  const settle = useCallback((token: string | null) => {
    const resolve = pending.current
    pending.current = null
    resolve?.(token)
  }, [])

  useEffect(
    () => () => {
      settle(null)
      try {
        if (widget.current) widget.current.api.remove(widget.current.id)
      } catch {
        // Already gone with its node.
      }
      widget.current = null
    },
    [settle],
  )

  /** A fresh, single-use token for one request; null when Turnstile is off or no pass came. */
  const token = useCallback(async (): Promise<string | null> => {
    if (!siteKey) return null
    const node = container.current
    if (!node) return null
    let api: Turnstile
    try {
      api = await loadTurnstile()
    } catch {
      return null
    }
    settle(null)
    const result = new Promise<string | null>((resolve) => {
      pending.current = resolve
      setTimeout(() => {
        if (pending.current === resolve) settle(null)
      }, WAIT_MS)
    })
    // The form may have swapped views since (sent → send again): a widget in a node that left the
    // page is dropped and drawn again in the current one.
    if (widget.current && widget.current.node !== node) {
      try {
        widget.current.api.remove(widget.current.id)
      } catch {
        // Already gone with its node.
      }
      widget.current = null
    }
    if (widget.current) {
      widget.current.api.reset(widget.current.id)
    } else {
      const id = api.render(node, {
        sitekey: siteKey,
        action,
        execution: 'execute',
        appearance: 'interaction-only',
        language: languages[locale] ?? 'auto',
        callback: (value: string) => settle(value),
        'error-callback': () => settle(null),
        'timeout-callback': () => settle(null),
      })
      widget.current = { api, id, node }
    }
    widget.current.api.execute(widget.current.id)
    return result
  }, [action, locale, settle])

  /** Where the box shows up when Cloudflare wants a tick; empty and takes no room otherwise. */
  const slot = siteKey ? <div ref={container} className="empty:hidden" /> : null

  return { enabled: Boolean(siteKey), token, slot }
}
