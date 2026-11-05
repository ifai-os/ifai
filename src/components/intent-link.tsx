'use client'

import { type ComponentProps, useState } from 'react'

import { Link } from '@/i18n/navigation'

/**
 * A `Link` that prefetches once the reader shows intent (pointer over it, keyboard focus, a
 * finger on it) instead of as soon as it scrolls into view. For long lists of story links: a
 * prefetch per visible row was most of the requests a list page made on Vercel, and a reader
 * opens one or two of them (docs/specs/daily.md「加载状态」). Hovering usually starts the
 * prefetch a few hundred milliseconds before the click; a tap gets less, and the page's
 * `loading.tsx` skeleton covers the rest. See node_modules/next/dist/docs/01-app/02-guides/prefetching.md.
 */
export function IntentLink({ onMouseEnter, onFocus, onTouchStart, ...props }: ComponentProps<typeof Link>) {
  const [active, setActive] = useState(false)
  return (
    <Link
      {...props}
      prefetch={active ? null : false}
      onMouseEnter={(event) => {
        setActive(true)
        onMouseEnter?.(event)
      }}
      onFocus={(event) => {
        setActive(true)
        onFocus?.(event)
      }}
      onTouchStart={(event) => {
        setActive(true)
        onTouchStart?.(event)
      }}
    />
  )
}
