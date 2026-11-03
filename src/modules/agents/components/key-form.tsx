'use client'

import { useTranslations } from 'next-intl'
import { useId, useState, type FormEvent } from 'react'

import { Button } from '@/components/button'

import { agentRules, defaultLifetime, keyLifetimes, keyScopes, parseKeyInput, type KeyInput, type KeyLifetime, type KeyScope } from '../rules'
import { ProblemText } from './problem'
import type { Sent } from './request'

/** 「新建密钥」: a note to tell it apart, read or read-and-write, and how long it works. */
export function KeyForm({ onMake, onCancel }: { onMake: (input: KeyInput) => Promise<Sent<object>>; onCancel: () => void }) {
  const t = useTranslations('agents')
  const [label, setLabel] = useState('')
  const [scope, setScope] = useState<KeyScope>('read')
  const [days, setDays] = useState<KeyLifetime>(defaultLifetime)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<Extract<Sent<object>, { ok: false }>['error'] | null>(null)
  const ids = { label: useId(), hint: useId(), days: useId() }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const input = parseKeyInput({ label, scope, days })
    if (!input) {
      setProblem('invalid-request')
      return
    }
    setBusy(true)
    setProblem(null)
    const result = await onMake(input)
    setBusy(false)
    if (!result.ok) setProblem(result.error)
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4 rounded-tile bg-surface p-4">
      <div className="flex flex-col gap-2">
        <label htmlFor={ids.label} className="text-ui font-medium">
          {t('keyLabel')}
        </label>
        <input
          id={ids.label}
          value={label}
          maxLength={agentRules.maxLabel}
          autoComplete="off"
          onChange={(event) => setLabel(event.target.value)}
          aria-describedby={ids.hint}
          className="h-11 w-full rounded-thumb border border-line bg-bg px-3.5 text-body text-ink outline-none focus:border-ink-4"
        />
        <span id={ids.hint} className="text-meta text-ink-4">
          {t('keyLabelHint')}
        </span>
      </div>
      <fieldset className="flex flex-col gap-1">
        <legend className="pb-1 text-ui font-medium">{t('scopeLabel')}</legend>
        {keyScopes.map((value) => (
          <label key={value} className="flex cursor-pointer items-start gap-2.5 py-1.5 text-ui">
            <input type="radio" name="scope" value={value} checked={scope === value} onChange={() => setScope(value)} className="mt-1 size-4 flex-none accent-ink" />
            <span className="flex flex-col gap-0.5">
              <span className="font-medium">{t(`scopes.${value}`)}</span>
              <span className="text-meta text-ink-4">{t(`scopeNotes.${value}`)}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <label htmlFor={ids.days} className="flex flex-wrap items-center gap-x-3 gap-y-2 text-ui font-medium">
        {t('lifetimeLabel')}
        <select
          id={ids.days}
          value={days}
          onChange={(event) => setDays(Number(event.target.value) as KeyLifetime)}
          className="h-10 rounded-thumb border border-line bg-bg px-3 text-ui font-normal text-ink outline-none focus:border-ink-4"
        >
          {keyLifetimes.map((value) => (
            <option key={value} value={value}>
              {t(`lifetimes.${value}`)}
            </option>
          ))}
        </select>
      </label>
      <ProblemText problem={problem} />
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={busy} className="disabled:opacity-60">
          {busy ? t('generating') : t('generate')}
        </Button>
        <Button variant="secondary" onClick={onCancel} disabled={busy}>
          {t('cancel')}
        </Button>
      </div>
    </form>
  )
}
