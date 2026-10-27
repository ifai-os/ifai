'use client'

import { type ReactNode, useEffect, useRef, useState } from 'react'

// 80 = the 56 header plus 24, as settings-nav and the article's side column use (top-20).
const TOP = 80
const BOTTOM = 24

/**
 * A side column that stays put while the page scrolls (as sspai.com's columns do): pinned 80 under
 * the top while it fits the window; a column taller than the window scrolls with the page until its
 * end is in view and is pinned there, so nothing in it is out of reach. Only where `className`
 * makes it sticky (e.g. `lg:sticky`); the parent must not stretch it (`items-start`).
 */
export function StickyColumn({ className, children }: { className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [top, setTop] = useState(TOP)

  useEffect(() => {
    const element = ref.current
    if (!element) return
    const measure = () => setTop(Math.min(TOP, window.innerHeight - element.offsetHeight - BOTTOM))
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    window.addEventListener('resize', measure)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [])

  return (
    <div ref={ref} style={{ top }} className={className}>
      {children}
    </div>
  )
}
