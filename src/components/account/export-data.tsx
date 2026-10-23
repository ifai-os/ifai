'use client'

import { useLocale, useTranslations } from 'next-intl'
import { useState } from 'react'

import { Button } from '@/components/button'
import { Icon } from '@/components/icon'
import { exportFileName } from '@/lib/auth/export-file'
import { dayKey, readerTimeZone } from '@/lib/local-time'

type State = { kind: 'idle' | 'preparing' | 'failed' | 'signedOut' } | { kind: 'done'; file: string }

/**
 * 「下载我的数据」(docs/specs/foundation.md「导出我的数据」). Fetches the file and saves it under
 * the reader's own date; a fetch rather than a plain link, so a failure or a sign-in that ran
 * out shows here instead of arriving as a downloaded error.
 */
export function ExportData() {
  const t = useTranslations('account')
  const locale = useLocale()
  const [state, setState] = useState<State>({ kind: 'idle' })

  async function download() {
    setState({ kind: 'preparing' })
    try {
      const response = await fetch(`/api/account/export?locale=${encodeURIComponent(locale)}`, { cache: 'no-store' })
      if (response.status === 401) {
        setState({ kind: 'signedOut' })
        return
      }
      if (!response.ok) throw new Error(`export failed: ${response.status}`)
      const file = exportFileName(dayKey(new Date(), readerTimeZone()))
      const url = URL.createObjectURL(await response.blob())
      const link = document.createElement('a')
      link.href = url
      link.download = file
      document.body.append(link)
      link.click()
      link.remove()
      // Some browsers start reading the file only after click() returns.
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
      setState({ kind: 'done', file })
    } catch {
      setState({ kind: 'failed' })
    }
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <Button variant="secondary" onClick={download} disabled={state.kind === 'preparing'} className="disabled:opacity-60">
        <Icon name="download" size={16} />
        {state.kind === 'preparing' ? t('exporting') : t('exportButton')}
      </Button>
      {/* Always there, so screen readers announce it; out of the layout while empty. */}
      <p role="status" className={state.kind === 'done' ? 'flex items-center gap-1.5 text-meta text-up wrap-anywhere' : 'sr-only'}>
        {state.kind === 'done' && (
          <>
            <Icon name="check" size={14} strokeWidth={2} />
            {t('exported', { file: state.file })}
          </>
        )}
      </p>
      {(state.kind === 'failed' || state.kind === 'signedOut') && (
        <p role="alert" className="text-meta text-down">
          {t(state.kind === 'failed' ? 'exportFailed' : 'exportSignedOut')}
        </p>
      )}
    </div>
  )
}
