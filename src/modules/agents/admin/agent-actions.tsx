'use client'

import { Button, toast, useConfig, useTranslation } from '@payloadcms/ui'
// eslint-disable-next-line no-restricted-imports -- admin routes have no locale prefix
import { useRouter } from 'next/navigation'
import { useId, useState } from 'react'

import { agentRules } from '../rules'
import { agentsAdminText } from './text'

const input = {
  font: 'inherit',
  width: '100%',
  maxWidth: '24rem',
  padding: '0.35em 0.5em',
  border: '1px solid var(--theme-elevation-250)',
  borderRadius: 'var(--style-radius-s)',
  background: 'var(--theme-input-bg)',
  color: 'var(--theme-text)',
} as const

/** Turn one agent off (with a reason its owner sees) or back on, then show the page again. */
export function AgentActions({ id, disabled }: { id: number; disabled: boolean }) {
  const { config } = useConfig()
  const { i18n } = useTranslation()
  const t = agentsAdminText(i18n.language)
  const router = useRouter()
  const reasonId = useId()
  const [asking, setAsking] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const tooLong = [...reason.trim()].length > agentRules.maxReason

  async function send(action: 'disable' | 'restore') {
    setBusy(true)
    try {
      const response = await fetch(`${config.routes.api}/agents/${id}/${action}`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(action === 'disable' ? { reason } : {}),
      })
      const data = (await response.json().catch(() => ({}))) as { error?: string }
      if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`)
      toast.success(action === 'disable' ? t.disabledToast : t.restoredToast)
      setAsking(false)
      setReason('')
      router.refresh()
    } catch (error) {
      toast.error(`${t.failed}: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setBusy(false)
    }
  }

  if (disabled) {
    return (
      <Button buttonStyle="secondary" size="small" margin={false} disabled={busy} onClick={() => send('restore')}>
        {t.restore}
      </Button>
    )
  }
  if (!asking) {
    return (
      <Button buttonStyle="secondary" size="small" margin={false} onClick={() => setAsking(true)}>
        {t.disable}
      </Button>
    )
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4em', minWidth: '14rem' }}>
      <label htmlFor={reasonId} style={{ fontSize: '0.85rem' }}>
        {t.reasonLabel}
      </label>
      <input id={reasonId} value={reason} onChange={(event) => setReason(event.target.value)} style={input} aria-invalid={tooLong || undefined} />
      {tooLong && <span style={{ color: 'var(--theme-error-500)', fontSize: '0.85rem' }}>{t.reasonTooLong(agentRules.maxReason)}</span>}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5em' }}>
        <Button buttonStyle="primary" size="small" margin={false} disabled={busy || tooLong} onClick={() => send('disable')}>
          {t.confirmDisable}
        </Button>
        <Button buttonStyle="secondary" size="small" margin={false} disabled={busy} onClick={() => setAsking(false)}>
          {t.cancel}
        </Button>
      </div>
    </div>
  )
}
