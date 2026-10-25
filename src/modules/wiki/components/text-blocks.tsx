import type { ReactNode } from 'react'

import type { InLanguage } from '@/lib/i18n/localized'

import { paragraphs } from '../rules'

/**
 * A plain-text field as paragraphs (a blank line starts a new one), in the language it is
 * written in. Text only, never markup: entries are written in the back office, not as HTML.
 */
export function Paragraphs({ text, className = '' }: { text: InLanguage<string>; className?: string }) {
  return (
    <div lang={text.lang} className={`flex flex-col gap-3 ${className}`}>
      {paragraphs(text.value).map((paragraph, index) => (
        <p key={index} className="whitespace-pre-line">
          {paragraph}
        </p>
      ))}
    </div>
  )
}

/** A section of an entry's page: a heading the table of contents links to, then its body. */
export function EntrySection({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={`${id}-title`} className="flex scroll-mt-20 flex-col gap-3" id={id}>
      <h2 id={`${id}-title`} className="text-h3 font-semibold">
        {title}
      </h2>
      {children}
    </section>
  )
}
