'use client'

import { useEffect, useRef } from 'react'

import { usePathname } from '@/i18n/navigation'

/**
 * The header's bottom line comes in only once the page has scrolled under it (as on sspai.com).
 * A page with a line of its own marks that element `data-header-line`: the header takes over the
 * line when that element reaches it. Other pages get the line as soon as they scroll at all.
 * Sets `data-lined` on the enclosing <header>; the header styles it.
 */
export function HeaderLine() {
  const ref = useRef<HTMLSpanElement>(null)
  const pathname = usePathname()

  useEffect(() => {
    const header = ref.current?.closest('header')
    if (!header) return
    const update = () => {
      const marker = document.querySelector('[data-header-line]')
      const lined = marker
        ? marker.getBoundingClientRect().top <= header.getBoundingClientRect().bottom
        : window.scrollY > 0
      header.toggleAttribute('data-lined', lined)
    }
    update()
    window.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [pathname])

  return <span ref={ref} hidden />
}
