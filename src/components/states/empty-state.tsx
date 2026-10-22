import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'

import type { IconName } from '@/components/icon'
import { StateShell } from '@/components/states/state-shell'

type EmptyStateProps = {
  icon?: IconName
  /** What will appear here once there is something. Defaults to「这里还没有内容」. */
  title?: string
  /** How to make that happen. */
  body?: string
  /** `ButtonLink`s to where the content comes from — the Daily, the Skills list — never a generic "go home". */
  children?: ReactNode
}

/** Empty state for a list or section with nothing to show yet. */
export function EmptyState({ icon = 'inbox', title, body, children }: EmptyStateProps) {
  const t = useTranslations('states')
  return (
    <StateShell icon={icon} title={title ?? t('emptyTitle')} body={body}>
      {children}
    </StateShell>
  )
}
