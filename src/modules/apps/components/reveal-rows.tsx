'use client'

import { useRef, useState, type ReactNode } from 'react'
import { flushSync } from 'react-dom'

type RevealRowsProps = {
  /** 「查看第 11–50 名」; null when every row already shows. */
  label: string | null
  children: ReactNode
}

/**
 * Holds the list's rows after the first ten until the reader asks for them. The rows are in the
 * page all along (crawlers and find-in-page see them); rows marked `data-extra` stay hidden
 * until the button is pressed, then focus moves to the first of them.
 */
export function RevealRows({ label, children }: RevealRowsProps) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)

  function reveal() {
    flushSync(() => setOpen(true))
    box.current?.querySelector<HTMLElement>('[data-extra] a')?.focus()
  }

  return (
    <div ref={box} data-open={open ? '' : undefined} className="group/rows flex flex-col gap-3">
      {children}
      {label && !open && (
        <button
          type="button"
          onClick={reveal}
          className="inline-flex h-10 items-center self-center rounded-pill border border-line bg-bg px-6 text-meta text-ink-2 transition-colors hover:border-ink-4 hover:text-ink"
        >
          {label}
        </button>
      )}
    </div>
  )
}
