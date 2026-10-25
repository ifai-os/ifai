'use client'

import { useLocale, useTranslations } from 'next-intl'
import { useEffect, useId, useRef, useState, useTransition, type KeyboardEvent } from 'react'

import { Icon } from '@/components/icon'
import { localeNames, localeShortNames, locales, type Locale } from '@/i18n/config'
import { usePathname, useRouter } from '@/i18n/navigation'

export function LanguageSwitcher() {
  const t = useTranslations('header')
  const locale = useLocale() as Locale
  const router = useRouter()
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const menuId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([])

  useEffect(() => {
    if (!open) return
    itemRefs.current[locales.indexOf(locale)]?.focus()
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open, locale])

  function choose(next: Locale) {
    setOpen(false)
    buttonRef.current?.focus()
    if (next === locale) return
    startTransition(() => {
      router.replace(pathname, { locale: next })
    })
  }

  function onMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const items = itemRefs.current
    const index = items.findIndex((item) => item === document.activeElement)
    const focusAt = (i: number) => items[(i + items.length) % items.length]?.focus()

    switch (event.key) {
      case 'Escape':
        event.preventDefault()
        setOpen(false)
        buttonRef.current?.focus()
        break
      case 'ArrowDown':
        event.preventDefault()
        focusAt(index + 1)
        break
      case 'ArrowUp':
        event.preventDefault()
        focusAt(index - 1)
        break
      case 'Home':
        event.preventDefault()
        focusAt(0)
        break
      case 'End':
        event.preventDefault()
        focusAt(items.length - 1)
        break
      case 'Tab':
        setOpen(false)
        break
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={t('language')}
        aria-busy={pending || undefined}
        onClick={() => setOpen((value) => !value)}
        className="m-1 flex h-9 items-center gap-1.5 rounded-pill border border-line bg-bg px-3 text-meta font-medium text-ink transition-colors hover:border-ink-4"
      >
        <Icon name="globe" size={16} />
        <span lang={locale}>{localeShortNames[locale]}</span>
      </button>

      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label={t('language')}
          onKeyDown={onMenuKeyDown}
          className="absolute right-1 top-12 z-30 flex w-50 flex-col rounded-tile bg-overlay p-1.5 shadow-float"
        >
          {locales.map((item, i) => {
            const checked = item === locale
            return (
              <button
                key={item}
                ref={(element) => {
                  itemRefs.current[i] = element
                }}
                type="button"
                role="menuitemradio"
                aria-checked={checked}
                lang={item}
                onClick={() => choose(item)}
                className={`flex h-10 items-center justify-between rounded-thumb px-2.5 text-left text-ui text-ink ${checked ? 'bg-surface font-medium' : 'hover:bg-surface'}`}
              >
                {localeNames[item]}
                {checked && <Icon name="check" size={16} />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
