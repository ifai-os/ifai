'use client'

import { useLocale, useTranslations } from 'next-intl'
import { useEffect, useId, useRef, useState, type FormEvent } from 'react'

import { Button, buttonClass } from '@/components/button'
import { Icon } from '@/components/icon'

import { textLength } from '../../reviews/rules'
import { needsBody, reportKinds, reportRules, type AppReportsError, type ReportKind } from '../rules'

type ReportApp = { id: number; name: string }

type ReportButtonProps = {
  app: ReportApp
  /** 「信息有误？告诉我们」at the foot of the page; the short「信息有误？」under the website image. */
  long?: boolean
  className?: string
}

/** 「信息有误？」: a reader tells the site owner what is wrong with an app's page. Visitors can too. */
export function ReportButton({ app, long = false, className }: ReportButtonProps) {
  const t = useTranslations('appReports')
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" aria-haspopup="dialog" onClick={() => setOpen(true)} className={className}>
        {long ? t('linkLong') : t('link')}
      </button>
      <ReportDialog app={app} open={open} onClose={() => setOpen(false)} />
    </>
  )
}

/** A native modal dialog, so focus stays inside and Escape closes it; the form starts afresh each time it opens. */
function ReportDialog({ app, open, onClose }: { app: ReportApp; open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      className="m-auto max-h-[calc(100dvh-32px)] w-[calc(100%-32px)] max-w-115 overflow-y-auto rounded-dialog bg-overlay p-0 text-ink shadow-float backdrop:bg-scrim"
    >
      {open && <ReportForm app={app} titleId={titleId} onClose={onClose} />}
    </dialog>
  )
}

type ErrorKey = 'kind' | 'body' | 'tooLong' | 'contactTooLong' | 'dailyLimit' | 'failed'

const errorFor: Partial<Record<AppReportsError, ErrorKey>> = {
  'invalid-kind': 'kind',
  'empty-body': 'body',
  'body-too-long': 'tooLong',
  'contact-too-long': 'contactTooLong',
  'daily-limit': 'dailyLimit',
}

function ReportForm({ app, titleId, onClose }: { app: ReportApp; titleId: string; onClose: () => void }) {
  const t = useTranslations('appReports')
  const states = useTranslations('states')
  const locale = useLocale()
  const [kind, setKind] = useState<ReportKind | null>(null)
  const [body, setBody] = useState('')
  const [contact, setContact] = useState('')
  const [error, setError] = useState<ErrorKey | null>(null)
  const [state, setState] = useState<'idle' | 'sending' | 'done'>('idle')
  const doneRef = useRef<HTMLButtonElement>(null)
  const ids = { body: useId(), count: useId(), contact: useId(), hint: useId(), error: useId() }

  const length = textLength(body.trim())
  const tooLong = length > reportRules.maxBody
  const optional = kind !== null && !needsBody(kind)

  useEffect(() => {
    // The form is gone once it is sent; keep focus in the dialog, on the way out.
    if (state === 'done') doneRef.current?.focus()
  }, [state])

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const text = body.trim()
    const reach = contact.trim()
    const problem: ErrorKey | null = !kind
      ? 'kind'
      : !text && needsBody(kind)
        ? 'body'
        : tooLong
          ? 'tooLong'
          : textLength(reach) > reportRules.maxContact
            ? 'contactTooLong'
            : null
    if (problem) {
      setError(problem)
      return
    }
    setState('sending')
    setError(null)
    try {
      const response = await fetch('/api/app-reports/new', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ app: app.id, kind, body: text, contact: reach, locale }),
      })
      if (response.ok) {
        setState('done')
        return
      }
      const data = (await response.json().catch(() => ({}))) as { error?: AppReportsError }
      setError((data.error && errorFor[data.error]) || 'failed')
    } catch {
      setError('failed')
    }
    setState('idle')
  }

  const close = (
    <button
      type="button"
      onClick={onClose}
      aria-label={states('dismiss')}
      className="absolute top-3.5 right-3.5 flex size-8 items-center justify-center rounded-pill text-ink-4 hover:text-ink"
    >
      <Icon name="close" size={16} strokeWidth={2} />
    </button>
  )

  if (state === 'done') {
    return (
      <div className="relative flex flex-col gap-3 p-5">
        <h2 id={titleId} className="pr-8 text-title font-semibold wrap-anywhere">
          {t('title', { name: app.name })}
        </h2>
        <p role="status" className="rounded-card bg-success-soft p-4 text-meta text-success-ink">
          {t('done')}
        </p>
        <button ref={doneRef} type="button" onClick={onClose} className={buttonClass('secondary', 'self-end')}>
          {states('dismiss')}
        </button>
        {close}
      </div>
    )
  }

  return (
    <form onSubmit={send} noValidate className="relative flex flex-col gap-4 p-5">
      <div className="flex flex-col gap-1 pr-8">
        <h2 id={titleId} className="text-title font-semibold wrap-anywhere">
          {t('title', { name: app.name })}
        </h2>
        <p className="text-meta text-ink-3">{t('intro')}</p>
      </div>

      <fieldset className="flex flex-col" aria-describedby={error === 'kind' ? ids.error : undefined}>
        <legend className="pb-1 text-meta font-medium text-ink-2">{t('kindLegend')}</legend>
        {reportKinds.map((value) => (
          <label key={value} className="flex min-h-10 cursor-pointer items-start gap-2.5 py-2 text-ui">
            <input
              type="radio"
              name="kind"
              value={value}
              checked={kind === value}
              onChange={() => {
                setKind(value)
                if (error === 'kind' || error === 'body') setError(null)
              }}
              className="mt-0.75 size-4 flex-none accent-ink"
            />
            <span className="flex flex-col gap-0.5">
              {t(`kinds.${value}`)}
              {value !== 'other' && <span className="text-small text-ink-4">{t(`kindHints.${value}`)}</span>}
            </span>
          </label>
        ))}
      </fieldset>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={ids.body} className="text-meta font-medium text-ink-2">
          {optional ? t('bodyOptional') : t('bodyLabel')}
        </label>
        <textarea
          id={ids.body}
          value={body}
          onChange={(event) => {
            setBody(event.target.value)
            if (error === 'body' || error === 'tooLong') setError(null)
          }}
          rows={4}
          placeholder={kind === 'shut-down' ? t('bodyPlaceholderShutDown') : t('bodyPlaceholder')}
          aria-invalid={error === 'body' || tooLong || undefined}
          aria-describedby={`${ids.count}${error === 'body' || error === 'tooLong' ? ` ${ids.error}` : ''}`}
          className={`min-h-28 resize-y rounded-thumb border bg-surface px-3.5 py-3 text-body text-ink outline-none placeholder:text-ink-4 focus:border-ink-4 ${
            tooLong || error === 'body' ? 'border-down' : 'border-surface-2'
          }`}
        />
        <span id={ids.count} className={`self-end text-small ${tooLong ? 'text-down' : 'text-ink-4'}`}>
          {t('charCount', { count: length, max: reportRules.maxBody })}
        </span>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={ids.contact} className="text-meta font-medium text-ink-2">
          {t('contactLabel')}
        </label>
        <input
          id={ids.contact}
          value={contact}
          onChange={(event) => {
            setContact(event.target.value)
            if (error === 'contactTooLong') setError(null)
          }}
          maxLength={reportRules.maxContact}
          autoComplete="email"
          aria-invalid={error === 'contactTooLong' || undefined}
          aria-describedby={`${ids.hint}${error === 'contactTooLong' ? ` ${ids.error}` : ''}`}
          className={`h-11 rounded-thumb border bg-surface px-3.5 text-ui text-ink outline-none focus:border-ink-4 ${
            error === 'contactTooLong' ? 'border-down' : 'border-surface-2'
          }`}
        />
        <span id={ids.hint} className="text-small text-ink-4">
          {t('contactHint')}
        </span>
      </div>

      {error && (
        <p id={ids.error} role="alert" className="text-small text-down">
          {t(`errors.${error}`, {
            max: error === 'contactTooLong' ? reportRules.maxContact : reportRules.maxBody,
            limit: reportRules.dailyLimit,
          })}
        </p>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          {t('cancel')}
        </Button>
        <Button type="submit" disabled={state === 'sending'} className="disabled:opacity-60">
          {state === 'sending' ? t('sending') : t('send')}
        </Button>
      </div>

      {/* Last in the DOM, so opening the dialog focuses the first choice rather than this. */}
      {close}
    </form>
  )
}
