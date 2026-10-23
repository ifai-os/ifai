'use client'

import { useLocale, useTranslations } from 'next-intl'
import { useEffect, useId, useRef, useState, type FormEvent } from 'react'

import { Button, ButtonLink } from '@/components/button'
import type { Locale } from '@/i18n/config'
import { textLength } from '@/modules/apps/reviews/rules'

import { parseSubmissionInput, submissionRules, type SubmissionField } from '../rules'

type FormError = 'tooMany' | 'signIn' | 'failed'

const field =
  'w-full rounded-thumb border bg-surface px-4 text-ui text-ink outline-none placeholder:text-ink-4 focus:border-ink-4 aria-[invalid]:border-down'

/**
 * The submission form: the GitHub address, a sentence on what the Skill does and where the result
 * goes (the account's email unless changed). Checked here with the API's own rules first; once
 * sent, the submission number takes the form's place.
 */
export function SubmitForm({ email: accountEmail }: { email: string }) {
  const t = useTranslations('resources.submit')
  const locale = useLocale() as Locale
  const [repository, setRepository] = useState('')
  const [note, setNote] = useState('')
  const [email, setEmail] = useState(accountEmail)
  const [invalid, setInvalid] = useState<SubmissionField[]>([])
  const [error, setError] = useState<FormError | null>(null)
  const [sending, setSending] = useState(false)
  const [done, setDone] = useState<{ code: string; email: string } | null>(null)
  const ids = { repository: useId(), note: useId(), email: useId() }
  const repositoryRef = useRef<HTMLInputElement>(null)
  const noteRef = useRef<HTMLTextAreaElement>(null)
  const emailRef = useRef<HTMLInputElement>(null)
  const doneHeading = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    if (done) doneHeading.current?.focus()
  }, [done])

  const noteLength = textLength(note.trim())
  const noteTooLong = noteLength > submissionRules.maxNote

  function showInvalid(fields: SubmissionField[]) {
    setInvalid(fields)
    const first = (['repository', 'note', 'email'] as const).find((name) => fields.includes(name))
    if (first) ({ repository: repositoryRef, note: noteRef, email: emailRef })[first].current?.focus()
  }

  function edited(name: SubmissionField) {
    if (invalid.includes(name)) setInvalid(invalid.filter((item) => item !== name))
    setError(null)
  }

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const parsed = parseSubmissionInput({ repository, note, email, locale })
    if (!parsed.ok) {
      showInvalid(parsed.fields)
      return
    }
    setSending(true)
    setError(null)
    try {
      const response = await fetch('/api/resources/submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed.value),
      })
      const body = (await response.json().catch(() => ({}))) as { code?: string; email?: string; fields?: SubmissionField[] }
      if (response.ok && body.code) setDone({ code: body.code, email: body.email ?? parsed.value.email })
      else if (response.status === 400 && body.fields?.length) showInvalid(body.fields)
      else setError(response.status === 429 ? 'tooMany' : response.status === 401 ? 'signIn' : 'failed')
    } catch {
      setError('failed')
    } finally {
      setSending(false)
    }
  }

  if (done) {
    return (
      <div className="flex flex-col items-start gap-4">
        <div className="flex w-full flex-col gap-1.5 rounded-card bg-success-soft p-5 text-success-ink">
          <h3 ref={doneHeading} tabIndex={-1} className="text-title font-semibold outline-none">
            {t('done.title')}
          </h3>
          <p className="text-body font-semibold tabular-nums">{t('done.number', { code: done.code })}</p>
          <p className="text-ui wrap-anywhere">{t('done.body', { email: done.email })}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button
            variant="secondary"
            onClick={() => {
              setRepository('')
              setNote('')
              setDone(null)
              requestAnimationFrame(() => repositoryRef.current?.focus())
            }}
          >
            {t('done.again')}
          </Button>
          <ButtonLink href="/resources">{t('done.back')}</ButtonLink>
        </div>
      </div>
    )
  }

  const noteWrong = invalid.includes('note') || noteTooLong
  const describedBy = (name: SubmissionField, hint: string, wrong = invalid.includes(name)) => (wrong ? `${hint} ${ids[name]}-error` : hint)

  return (
    <form onSubmit={send} noValidate className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <label htmlFor={ids.repository} className="text-meta font-medium text-ink-2">
          {t('form.repository')}
        </label>
        <input
          ref={repositoryRef}
          id={ids.repository}
          type="url"
          name="repository"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          value={repository}
          onChange={(event) => {
            setRepository(event.target.value)
            edited('repository')
          }}
          placeholder={t('form.repositoryPlaceholder')}
          aria-invalid={invalid.includes('repository') || undefined}
          aria-describedby={describedBy('repository', `${ids.repository}-hint`)}
          className={`${field} h-11 border-surface-2`}
        />
        <span id={`${ids.repository}-hint`} className="text-small text-ink-4">
          {t('form.repositoryHint')}
        </span>
        {invalid.includes('repository') && (
          <span id={`${ids.repository}-error`} className="text-small text-down">
            {t('form.errors.repository')}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={ids.note} className="text-meta font-medium text-ink-2">
          {t('form.note')}
        </label>
        <textarea
          ref={noteRef}
          id={ids.note}
          name="note"
          rows={2}
          value={note}
          onChange={(event) => {
            setNote(event.target.value)
            edited('note')
          }}
          placeholder={t('form.notePlaceholder')}
          aria-invalid={noteWrong || undefined}
          aria-describedby={describedBy('note', `${ids.note}-count`, noteWrong)}
          className={`${field} min-h-20 resize-y border-surface-2 py-3`}
        />
        <div className="flex items-start justify-between gap-3">
          <span id={`${ids.note}-error`} className="text-small text-down">
            {noteWrong && t('form.errors.note', { max: submissionRules.maxNote })}
          </span>
          <span id={`${ids.note}-count`} className={`flex-none text-small tabular-nums ${noteTooLong ? 'text-down' : 'text-ink-4'}`}>
            {t('form.count', { count: noteLength, max: submissionRules.maxNote })}
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={ids.email} className="text-meta font-medium text-ink-2">
          {t('form.email')}
        </label>
        <input
          ref={emailRef}
          id={ids.email}
          type="email"
          name="email"
          autoComplete="email"
          inputMode="email"
          value={email}
          onChange={(event) => {
            setEmail(event.target.value)
            edited('email')
          }}
          aria-invalid={invalid.includes('email') || undefined}
          aria-describedby={describedBy('email', `${ids.email}-hint`)}
          className={`${field} h-11 border-surface-2`}
        />
        <span id={`${ids.email}-hint`} className="text-small text-ink-4">
          {t('form.emailHint')}
        </span>
        {invalid.includes('email') && (
          <span id={`${ids.email}-error`} className="text-small text-down">
            {t('form.errors.email')}
          </span>
        )}
      </div>

      {error && (
        <p role="alert" className="text-small text-down">
          {error === 'tooMany' ? t('form.errors.tooMany', { max: submissionRules.dailyLimit }) : t(`form.errors.${error}`)}
        </p>
      )}

      <Button type="submit" disabled={sending} className="self-start disabled:opacity-60">
        {sending ? t('form.sending') : t('form.send')}
      </Button>
    </form>
  )
}
