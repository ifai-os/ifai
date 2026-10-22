'use client'

import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'

import { Button } from '@/components/button'
import { StateShell } from '@/components/states/state-shell'

type LoadFailedProps = {
  onRetry: () => void
  /** Defaults to「加载失败」. */
  title?: string
  body?: string
  /** Extra actions next to the retry button. */
  children?: ReactNode
}

/** Replaces a skeleton that waited too long, or a block whose request failed. Inline, so the rest of the page stays readable. */
export function LoadFailed({ onRetry, title, body, children }: LoadFailedProps) {
  const t = useTranslations('states')
  return (
    <StateShell icon="alert" role="alert" title={title ?? t('failedTitle')} body={body}>
      <Button onClick={onRetry}>{t('retry')}</Button>
      {children}
    </StateShell>
  )
}
