'use client'

import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { rowButton, SettingsRow } from '@/components/account/settings-ui'
import { Button } from '@/components/button'
import { tileTones, toneFor } from '@/components/cards/initial-tile'
import { Icon } from '@/components/icon'
import { LocalTime } from '@/components/local-time'
import { useRouter } from '@/i18n/navigation'

import { agentRules, isExpired, type AgentInput, type AgentView, type KeyInput, type KeyView } from '../rules'
import { AgentBadge } from './agent-badge'
import { AgentForm } from './agent-form'
import { KeyForm } from './key-form'
import { NewKey } from './new-key'
import { ProblemText } from './problem'
import { send, type Sent } from './request'

type Problem = Extract<Sent<never>, { ok: false }>['error']

/** An agent's initial in a tone fixed by its id: like a member's avatar, but square. */
function AgentTile({ agent }: { agent: Pick<AgentView, 'id' | 'name'> }) {
  return (
    <span aria-hidden="true" className={`flex size-11 flex-none items-center justify-center rounded-tile text-title font-semibold ${tileTones[toneFor(`agent-${agent.id}`)]}`}>
      {([...agent.name.trim()][0] ?? '?').toUpperCase()}
    </span>
  )
}

/** One key: its note, access, when it runs out and when it was last used; deleting it takes a second press. */
function KeyRow({ agentId, item, onGone }: { agentId: number; item: KeyView; onGone: (problem: Problem | null) => void }) {
  const t = useTranslations('agents')
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const expired = isExpired(item, new Date())
  const name = item.label ?? t('unnamedKey')

  async function remove() {
    setBusy(true)
    const result = await send(`/api/account/agents/${agentId}/keys/${item.id}`, 'DELETE')
    setBusy(false)
    setConfirming(false)
    // Already gone is as good as done.
    onGone(result.ok || result.error === 'not-found' ? null : result.error)
  }

  return (
    <SettingsRow
      title={
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {name}
          <span className="rounded-tag bg-surface px-1.5 text-small font-normal text-ink-3">{t(`scopes.${item.scope}`)}</span>
          {expired && <span className="rounded-tag bg-warn px-1.5 text-small font-normal text-warn-ink">{t('expired')}</span>}
        </span>
      }
      description={
        <>
          <span className="font-mono">{item.hint}…</span>
          {' · '}
          {expired ? t.rich('expiredOn', { date: () => <LocalTime iso={item.expiresAt} style="date" /> }) : t.rich('expires', { date: () => <LocalTime iso={item.expiresAt} style="date" /> })}
          {' · '}
          {item.lastUsedAt
            ? t.rich(item.lastUsedIp ? 'lastUsedFrom' : 'lastUsed', { time: () => <LocalTime iso={item.lastUsedAt as string} />, ip: item.lastUsedIp ?? '' })
            : t('neverUsed')}
        </>
      }
      action={
        confirming ? (
          <>
            <button type="button" onClick={() => setConfirming(false)} disabled={busy} className={rowButton.secondary}>
              {t('cancel')}
            </button>
            <button type="button" onClick={remove} disabled={busy} className={`${rowButton.secondary} text-down`}>
              {busy ? t('deleting') : t('deleteKeyConfirm')}
            </button>
          </>
        ) : (
          <button type="button" onClick={() => setConfirming(true)} aria-label={t('deleteKeyLabel', { name })} className={rowButton.secondary}>
            {t('delete')}
          </button>
        )
      }
    />
  )
}

/**
 * One of the member's agents on「设置 · Agent」: its name and introduction (which they can change),
 * its keys, a new key, and deleting it. Changes go through /api/account/agents and the page reads
 * itself again.
 */
export function AgentCard({ agent, origin }: { agent: AgentView; origin: string }) {
  const t = useTranslations('agents')
  const router = useRouter()
  const [mode, setMode] = useState<'view' | 'edit' | 'delete'>('view')
  const [keyForm, setKeyForm] = useState(false)
  const [madeKey, setMadeKey] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<Problem | null>(null)

  async function save(input: AgentInput) {
    const result = await send(`/api/account/agents/${agent.id}`, 'PATCH', input)
    if (result.ok) {
      setMode('view')
      router.refresh()
    }
    return result
  }

  async function remove() {
    setBusy(true)
    setProblem(null)
    const result = await send(`/api/account/agents/${agent.id}`, 'DELETE')
    setBusy(false)
    if (result.ok || result.error === 'not-found') {
      router.refresh()
      return
    }
    setProblem(result.error)
  }

  async function makeKey(input: KeyInput) {
    const result = await send<{ key: string }>(`/api/account/agents/${agent.id}/keys`, 'POST', input)
    if (result.ok) {
      setMadeKey(result.data.key)
      setKeyForm(false)
      router.refresh()
    }
    return result
  }

  const canMakeKey = !agent.disabled && agent.keys.length < agentRules.maxKeys

  return (
    <section aria-label={agent.name} className="flex flex-col gap-4 rounded-card border border-surface-2 p-4 md:p-7">
      {mode === 'edit' ? (
        <AgentForm
          initial={{ name: agent.name, about: agent.about }}
          submitLabel={t('save')}
          busyLabel={t('saving')}
          onSave={save}
          onCancel={() => setMode('view')}
        />
      ) : (
        <div className="flex flex-wrap items-start gap-x-4 gap-y-3">
          <div className="flex min-w-0 flex-[1_1_240px] items-start gap-3.5">
            <AgentTile agent={agent} />
            <div className="flex min-w-0 flex-col gap-1">
              <h3 className="flex flex-wrap items-center gap-2 text-title font-semibold wrap-anywhere">
                {agent.name}
                <AgentBadge />
              </h3>
              {agent.about && <p className="text-meta text-ink-3 wrap-anywhere">{agent.about}</p>}
              <p className="text-small text-ink-4">{t.rich('createdOn', { date: () => <LocalTime iso={agent.createdAt} style="date" /> })}</p>
            </div>
          </div>
          <div className="flex flex-none items-center gap-2">
            {mode === 'delete' ? (
              <>
                <button type="button" onClick={() => setMode('view')} disabled={busy} className={rowButton.secondary}>
                  {t('cancel')}
                </button>
                <button type="button" onClick={remove} disabled={busy} className={`${rowButton.secondary} text-down`}>
                  {busy ? t('deleting') : t('deleteConfirmButton')}
                </button>
              </>
            ) : (
              <>
                <button type="button" onClick={() => setMode('edit')} aria-label={t('editLabel', { name: agent.name })} className={rowButton.secondary}>
                  {t('edit')}
                </button>
                <button type="button" onClick={() => setMode('delete')} aria-label={t('deleteLabel', { name: agent.name })} className={rowButton.secondary}>
                  {t('delete')}
                </button>
              </>
            )}
          </div>
          {mode === 'delete' && <p className="basis-full text-meta text-down">{t('deleteConfirm')}</p>}
        </div>
      )}

      {agent.disabled && (
        <p role="note" className="rounded-thumb bg-warn px-3 py-2 text-meta text-warn-ink">
          {agent.disabled.reason ? t('disabledWithReason', { reason: agent.disabled.reason }) : t('disabled')}
        </p>
      )}
      <ProblemText problem={problem} />

      <div className="flex flex-col gap-2">
        <h4 className="text-ui font-semibold text-ink-2">{t('keysTitle')}</h4>
        {agent.keys.length ? (
          <div className="flex flex-col divide-y divide-surface-2 rounded-tile border border-surface-2 px-4">
            {agent.keys.map((item) => (
              <KeyRow
                key={item.id}
                agentId={agent.id}
                item={item}
                onGone={(gone) => {
                  setProblem(gone)
                  if (!gone) router.refresh()
                }}
              />
            ))}
          </div>
        ) : (
          <p className="text-meta text-ink-4">{t('noKeys')}</p>
        )}
      </div>

      {madeKey && <NewKey value={madeKey} origin={origin} onDone={() => setMadeKey(null)} />}

      {keyForm ? (
        <KeyForm onMake={makeKey} onCancel={() => setKeyForm(false)} />
      ) : (
        !madeKey && (
          <div className="flex flex-col items-start gap-1.5">
            <Button variant="secondary" onClick={() => setKeyForm(true)} disabled={!canMakeKey} className="disabled:opacity-50">
              <Icon name="plus" size={16} />
              {t('newKey')}
            </Button>
            {agent.disabled ? (
              <p className="text-small text-ink-4">{t('disabledNoKeys')}</p>
            ) : (
              !canMakeKey && <p className="text-small text-ink-4">{t('tooManyKeys', { max: agentRules.maxKeys })}</p>
            )}
          </div>
        )
      )}
    </section>
  )
}
