import type { ReactNode, Ref } from 'react'

import { InitialTile } from '@/components/cards/initial-tile'
import { Icon } from '@/components/icon'

export type SubmittedStep = { label: string; detail: string }

type SubmittedProps = {
  title: string
  /** How long the review takes and where the result goes. */
  body: string
  /** What was sent, with its number in `meta`, so a question about it can be looked up. */
  item: { initial: string; name: string; meta: string; tone?: number }
  /** Sent, in review, live: the first is done, the second under way, the rest still to come. */
  steps: SubmittedStep[]
  /** The heading names the surrounding section and takes the focus from the form it replaces. */
  headingId?: string
  headingRef?: Ref<HTMLHeadingElement>
  /** One or two buttons. */
  children: ReactNode
}

const dots = ['bg-up', 'border-2 border-link bg-bg', 'border-2 border-disabled bg-bg'] as const

/**
 * 「提交成功」 from the「空状态与加载状态」board, for submitting an app or a Skill: what happens
 * next, by when, and where the result goes, with the number to ask about it by.
 */
export function Submitted({ title, body, item, steps, headingId, headingRef, children }: SubmittedProps) {
  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex items-center gap-2.5">
        <span aria-hidden="true" className="flex size-9 flex-none items-center justify-center rounded-pill bg-success-soft text-up">
          <Icon name="check" size={20} strokeWidth={2.2} />
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 id={headingId} ref={headingRef} tabIndex={-1} className="text-title font-semibold outline-none">
            {title}
          </h2>
          <p className="text-small text-ink-4 wrap-anywhere">{body}</p>
        </div>
      </div>

      <div className="flex items-center gap-2.5 rounded-thumb bg-surface px-3 py-2.5">
        <InitialTile label={item.initial} tone={item.tone} size="sm" />
        <div className="flex min-w-0 flex-col gap-0.5 wrap-anywhere">
          <span className="text-ui font-medium">{item.name}</span>
          <span className="font-mono text-small text-ink-4">{item.meta}</span>
        </div>
      </div>

      <ol className="flex flex-col">
        {steps.map((step, index) => (
          <li key={step.label} aria-current={index === 1 ? 'step' : undefined} className="grid grid-cols-[16px_minmax(0,1fr)] gap-2.5">
            <span aria-hidden="true" className="flex flex-col items-center">
              <span className={`mt-1.25 size-2.5 flex-none rounded-pill ${dots[Math.min(index, 2)]}`} />
              {index < steps.length - 1 && <span className="min-h-2.5 w-px flex-1 bg-line" />}
            </span>
            <span className="flex flex-col pb-2.5">
              <span className={index < 2 ? 'text-ui font-medium' : 'text-ui text-ink-4'}>{step.label}</span>
              <span className="text-small text-ink-4">{step.detail}</span>
            </span>
          </li>
        ))}
      </ol>

      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  )
}
