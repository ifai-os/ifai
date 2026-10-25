'use client'

import { useTranslations } from 'next-intl'
import { useSyncExternalStore } from 'react'

import { applyTheme, themeFromCookie, themes, type Theme } from '@/lib/theme'

const listeners = new Set<() => void>()

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Follow system / light / dark, as on the design's「外观」control. */
export function ThemePicker({ className = '' }: { className?: string }) {
  const t = useTranslations('theme')
  const current = useSyncExternalStore(
    subscribe,
    () => themeFromCookie(document.cookie),
    (): Theme => 'system',
  )

  function choose(theme: Theme) {
    applyTheme(theme)
    listeners.forEach((listener) => listener())
  }

  return (
    <div role="group" aria-label={t('label')} className={`flex gap-0.5 rounded-thumb bg-surface-2 p-0.75 ${className}`}>
      {themes.map((theme) => {
        const on = theme === current
        return (
          <button
            key={theme}
            type="button"
            aria-pressed={on}
            onClick={() => choose(theme)}
            className={`h-7.5 flex-1 rounded-btn px-3 text-meta whitespace-nowrap transition-colors ${
              on ? 'bg-bg text-ink shadow-raised dark:bg-line' : 'text-ink-2 hover:text-ink'
            }`}
          >
            {t(theme)}
          </button>
        )
      })}
    </div>
  )
}
