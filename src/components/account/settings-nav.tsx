'use client'

import { useTranslations } from 'next-intl'
import { useEffect, useRef } from 'react'

import { Link } from '@/i18n/navigation'

import { sectionHref, settingsSections, type SettingsSection } from './sections'

/**
 * The sections of「设置」: a column on the left on desktops, a row of buttons that slides
 * sideways on phones, where the open one is brought into view.
 */
export function SettingsNav({ current }: { current: SettingsSection }) {
  const t = useTranslations('account')
  const ref = useRef<HTMLElement>(null)

  useEffect(() => {
    const nav = ref.current
    const on = nav?.querySelector<HTMLElement>('[aria-current="page"]')
    if (!nav || !on || nav.scrollWidth <= nav.clientWidth) return
    nav.scrollLeft = on.offsetLeft - (nav.clientWidth - on.offsetWidth) / 2
  }, [current])

  return (
    <nav
      ref={ref}
      aria-label={t('sectionsLabel')}
      className="relative -mx-4 flex gap-2 overflow-x-auto px-4 md:sticky md:top-20 md:mx-0 md:w-50 md:flex-none md:flex-col md:gap-1 md:overflow-visible md:px-0"
    >
      {settingsSections.map((section) => {
        const on = section === current
        return (
          <Link
            key={section}
            href={sectionHref(section)}
            aria-current={on ? 'page' : undefined}
            className={`flex h-9 flex-none items-center rounded-pill border px-3.5 text-ui whitespace-nowrap transition-colors md:h-11 md:rounded-tile md:border-0 md:text-body ${
              on ? 'border-ink bg-ink text-bg md:bg-surface md:font-semibold md:text-ink' : 'border-line text-ink-2 hover:text-ink md:hover:bg-surface'
            }`}
          >
            {t(`sections.${section}`)}
          </Link>
        )
      })}
    </nav>
  )
}
