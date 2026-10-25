'use client'

import { useLocale, useTranslations } from 'next-intl'
import { useTransition } from 'react'

import { localeNames, locales, type Locale } from '@/i18n/config'
import { useRouter } from '@/i18n/navigation'

import { sectionHref } from './sections'

/**
 * 「界面语言」(docs/specs/account.md): the five languages, each in its own words. Choosing one
 * opens this section in it and is remembered like the header's switcher (the IFAI_LOCALE cookie).
 */
export function LanguageChoice() {
  const t = useTranslations('account')
  const locale = useLocale() as Locale
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  function choose(next: Locale) {
    if (next === locale) return
    startTransition(() => router.replace(sectionHref('language'), { locale: next }))
  }

  return (
    <div role="group" aria-label={t('languageLabel')} aria-busy={pending || undefined} className="flex flex-wrap gap-2">
      {locales.map((item) => {
        const current = item === locale
        return (
          <button
            key={item}
            type="button"
            lang={item}
            aria-pressed={current}
            onClick={() => choose(item)}
            className={`h-9 rounded-btn border px-3.5 text-meta font-medium transition-colors ${current ? 'border-ink bg-ink text-white' : 'border-line bg-bg text-ink-2 hover:border-ink-4'}`}
          >
            {localeNames[item]}
          </button>
        )
      })}
    </div>
  )
}
