import type { ReactNode } from 'react'

/** The pieces every section of「设置」is made of (「IFAI 账号设置」): a heading, cards of rows, smaller headings between cards. */

export function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="text-h2">{children}</h2>
}

export function GroupTitle({ children }: { children: ReactNode }) {
  return <h3 className="pt-3 text-body font-semibold text-ink-2">{children}</h3>
}

/** A card of rows with lines between them. */
export function SettingsCard({ children }: { children: ReactNode }) {
  return <div className="flex flex-col divide-y divide-surface-2 rounded-card border border-surface-2 px-4 md:px-7">{children}</div>
}

/**
 * A title and a line about it on the left, whatever acts on it on the right: under it when the
 * row is too narrow for both, and always under it when `below` (the language buttons).
 */
export function SettingsRow({
  title,
  description,
  action,
  lead,
  below = false,
}: {
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
  lead?: ReactNode
  below?: boolean
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-3 py-4.5 md:gap-x-6">
      <div className="flex min-w-0 flex-[1_1_200px] items-center gap-3.5">
        {lead}
        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-ui font-medium wrap-anywhere">{title}</span>
          {description && <span className="text-meta text-ink-4 wrap-anywhere">{description}</span>}
        </div>
      </div>
      {action && <div className={`flex items-center gap-3 ${below ? 'basis-full' : 'flex-none'}`}>{action}</div>}
    </div>
  )
}

/** The small buttons inside rows: outlined, or black for the one thing to do. */
export const rowButton = {
  secondary:
    'inline-flex h-8.5 items-center justify-center rounded-btn border border-line bg-bg px-3.5 text-meta font-medium whitespace-nowrap text-ink transition-colors hover:border-ink-4 disabled:cursor-not-allowed disabled:opacity-50',
  primary:
    'inline-flex h-8.5 items-center justify-center rounded-btn bg-ink px-3.5 text-meta font-medium whitespace-nowrap text-white transition-colors hover:bg-ink-2 disabled:opacity-60',
} as const
