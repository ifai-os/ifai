import type { ReactNode } from 'react'

import { Icon, type IconName } from '@/components/icon'

type StateShellProps = {
  icon: IconName
  title: string
  body?: string
  /** "alert" for failures; leave empty for an ordinary empty state. */
  role?: 'alert'
  /** Actions — one or two buttons that lead somewhere useful. */
  children?: ReactNode
}

/** Grey block with a muted icon, a title, one line of help and actions — the shape every empty and failed state shares on the「空状态与加载状态」board. */
export function StateShell({ icon, title, body, role, children }: StateShellProps) {
  return (
    <div
      role={role}
      className="flex flex-col items-center justify-center gap-3.5 rounded-card border border-surface-2 bg-surface px-5 py-14 text-center"
    >
      <span aria-hidden="true" className="flex size-18 items-center justify-center rounded-pill bg-bg text-mute">
        <Icon name={icon} size={32} strokeWidth={1.6} />
      </span>
      <div className="flex max-w-70 flex-col gap-1.5 wrap-anywhere">
        <p className="text-title font-semibold">{title}</p>
        {body && <p className="text-meta text-ink-4">{body}</p>}
      </div>
      {children && <div className="flex flex-wrap justify-center gap-2">{children}</div>}
    </div>
  )
}
