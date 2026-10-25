'use client'

import { useState, type ReactNode } from 'react'

/** A list that shows its first rows and the rest after「查看更多」(「话题追踪」). */
export function ShowMoreList({
  rows,
  shown,
  className,
  labels,
}: {
  rows: ReactNode[]
  shown: number
  className?: string
  labels: { more: string; less: string }
}) {
  const [open, setOpen] = useState(false)
  const hidden = rows.length - shown
  return (
    <>
      <ol className={className}>{open || hidden <= 0 ? rows : rows.slice(0, shown)}</ol>
      {hidden > 0 && (
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          className="inline-flex h-10 items-center self-center rounded-pill border border-line bg-bg px-6 text-meta text-ink-2 transition-colors hover:border-ink-4"
        >
          {open ? labels.less : labels.more}
        </button>
      )}
    </>
  )
}
