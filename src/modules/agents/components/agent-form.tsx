'use client'

import { useTranslations } from 'next-intl'
import { useId, useState, type FormEvent } from 'react'

import { Button } from '@/components/button'
import { cleanLine } from '@/modules/apps/reviews/rules'

import { agentRules, parseAgentInput, type AgentInput } from '../rules'
import { ProblemText } from './problem'
import type { Sent } from './request'

const field = 'h-11 w-full rounded-thumb border bg-surface px-3.5 text-body text-ink outline-none focus:border-ink-4'

/**
 * An agent's name and introduction: for a new agent, and to change one. The server cleans and
 * checks them again (../rules.ts `parseAgentInput`).
 */
export function AgentForm({
  initial,
  submitLabel,
  busyLabel,
  onSave,
  onCancel,
}: {
  initial?: AgentInput
  submitLabel: string
  busyLabel: string
  onSave: (input: AgentInput) => Promise<Sent<object>>
  onCancel?: () => void
}) {
  const t = useTranslations('agents')
  const [name, setName] = useState(initial?.name ?? '')
  const [about, setAbout] = useState(initial?.about ?? '')
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<Extract<Sent<object>, { ok: false }>['error'] | null>(null)
  const ids = { name: useId(), about: useId(), nameHint: useId(), aboutHint: useId(), error: useId() }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const input = parseAgentInput({ name, about })
    if (!input.ok) {
      setProblem(input.error)
      return
    }
    setBusy(true)
    setProblem(null)
    const result = await onSave(input.value)
    setBusy(false)
    if (!result.ok) {
      setProblem(result.error)
      return
    }
    if (!initial) {
      setName('')
      setAbout('')
    }
  }

  const nameProblem = problem === 'empty-name' || problem === 'name-too-long' || problem === 'name-taken'

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-3">
          <label htmlFor={ids.name} className="text-ui font-medium">
            {t('nameLabel')}
          </label>
          <span className="text-small text-ink-4">{t('count', { count: [...cleanLine(name)].length, max: agentRules.maxName })}</span>
        </div>
        <input
          id={ids.name}
          value={name}
          maxLength={agentRules.maxName + 10}
          autoComplete="off"
          onChange={(event) => setName(event.target.value)}
          aria-invalid={nameProblem || undefined}
          aria-describedby={[ids.nameHint, problem ? ids.error : null].filter(Boolean).join(' ')}
          className={`${field} ${nameProblem ? 'border-down' : 'border-surface-2'}`}
        />
        <span id={ids.nameHint} className="text-meta text-ink-4">
          {t('nameHint')}
        </span>
      </div>
      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-3">
          <label htmlFor={ids.about} className="text-ui font-medium">
            {t('aboutLabel')}
          </label>
          <span className="text-small text-ink-4">{t('count', { count: [...cleanLine(about)].length, max: agentRules.maxAbout })}</span>
        </div>
        <input
          id={ids.about}
          value={about}
          maxLength={agentRules.maxAbout + 20}
          autoComplete="off"
          onChange={(event) => setAbout(event.target.value)}
          aria-invalid={problem === 'about-too-long' || undefined}
          aria-describedby={ids.aboutHint}
          className={`${field} ${problem === 'about-too-long' ? 'border-down' : 'border-surface-2'}`}
        />
        <span id={ids.aboutHint} className="text-meta text-ink-4">
          {t('aboutHint')}
        </span>
      </div>
      <ProblemText problem={problem} id={ids.error} />
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={busy} className="disabled:opacity-60">
          {busy ? busyLabel : submitLabel}
        </Button>
        {onCancel && (
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            {t('cancel')}
          </Button>
        )}
      </div>
    </form>
  )
}
