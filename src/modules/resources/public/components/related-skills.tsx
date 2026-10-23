'use client'

import { useState, type ReactNode } from 'react'

/** 「相关 Skill」: three at a time out of up to six;「换一换」shows the next three. */
export function RelatedSkills({ title, shuffleLabel, items }: { title: string; shuffleLabel: string; items: ReactNode[] }) {
  const [start, setStart] = useState(0)
  const shown = items.length <= 3 ? items : [0, 1, 2].map((offset) => items[(start + offset) % items.length])

  return (
    <section aria-labelledby="related-title" className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between gap-3">
        <h2 id="related-title" className="text-title font-semibold">
          {title}
        </h2>
        {items.length > 3 && (
          <button type="button" onClick={() => setStart((value) => (value + 3) % items.length)} className="text-meta text-ink-4 hover:text-ink">
            {shuffleLabel}
          </button>
        )}
      </div>
      <ul className="flex flex-col">{shown}</ul>
    </section>
  )
}
