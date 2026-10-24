'use client'

import { useState } from 'react'

import { Link } from '@/i18n/navigation'

export type Fact = {
  fact: string
  /** The language the fact is written in (an English fallback on other pages). */
  lang: string
  href: `/${string}`
  /** 「去看条目「…」›」, already put together on the server. */
  link: string
}

type FactBoxProps = {
  facts: Fact[]
  labels: { title: string; another: string }
}

/**
 * 「你知道吗」(board「IFAI Wiki」): one entry's fact at a time, and「换一条」for the next one. The
 * first fact is in the page itself; the button only turns to the others the page already has.
 */
export function FactBox({ facts, labels }: FactBoxProps) {
  const [index, setIndex] = useState(0)
  const current = facts[index % facts.length]
  if (!current) return null

  return (
    <section aria-labelledby="wiki-fact" className="flex flex-1 basis-80 flex-col gap-3 rounded-hero border border-surface-2 bg-surface px-5.5 py-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="wiki-fact" className="text-title">
          {labels.title}
        </h2>
        {facts.length > 1 && (
          <button
            type="button"
            onClick={() => setIndex((value) => value + 1)}
            className="flex min-h-11 items-center text-meta text-ink-4 hover:text-ink"
          >
            {labels.another}
          </button>
        )}
      </div>
      <p aria-live="polite" lang={current.lang} className="text-body">
        {current.fact}
      </p>
      <Link href={current.href} className="self-start text-meta text-link hover:underline">
        {current.link}
      </Link>
    </section>
  )
}
