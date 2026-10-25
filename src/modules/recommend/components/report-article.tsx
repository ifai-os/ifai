'use client'

import { useTranslations } from 'next-intl'
import { useEffect, useId, useRef, useState, type FormEvent } from 'react'

import { Button } from '@/components/button'
import { Icon } from '@/components/icon'

import { reportReasons, type ReportReason } from '../writing'

/** 「举报」under a reader's article (docs/specs/recommend.md rule 17): why, then a thank-you. */
export function ReportArticle({ articleId }: { articleId: number }) {
  const t = useTranslations('recommend.report')
  const states = useTranslations('states')
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState<ReportReason | null>(null)
  const [state, setState] = useState<'idle' | 'sending' | 'done' | 'own' | 'failed'>('idle')

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!reason) return
    setState('sending')
    try {
      const response = await fetch('/api/recommend/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ article: articleId, reason }),
      })
      const error = response.ok ? null : ((await response.json().catch(() => ({}))) as { error?: string }).error
      setState(response.ok ? 'done' : error === 'own-article' ? 'own' : 'failed')
    } catch {
      setState('failed')
    }
  }

  const close = () => setOpen(false)

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="flex min-h-10 items-center gap-1.5 text-meta text-ink-4 hover:text-ink">
        <Icon name="alert" size={16} />
        {t('open')}
      </button>
      <dialog
        ref={ref}
        aria-labelledby={titleId}
        onClose={close}
        className="m-auto w-[calc(100%-32px)] max-w-90 overflow-visible rounded-dialog bg-overlay p-0 text-ink shadow-float backdrop:bg-scrim"
      >
        {open && (
          <div className="relative flex flex-col gap-3 p-5">
            <h2 id={titleId} className="pr-8 text-title font-semibold">
              {t('title')}
            </h2>
            {state === 'done' || state === 'own' ? (
              <>
                <p role="status" className="rounded-card bg-success-soft p-4 text-meta text-success-ink">
                  {t(state === 'done' ? 'done' : 'own')}
                </p>
                <Button variant="secondary" onClick={close} className="self-end">
                  {states('dismiss')}
                </Button>
              </>
            ) : (
              <form onSubmit={send} className="flex flex-col gap-3">
                <p className="text-meta text-ink-3">{t('body')}</p>
                <fieldset className="flex flex-col">
                  <legend className="pb-1 text-meta font-medium text-ink-2">{t('reason')}</legend>
                  {reportReasons.map((value) => (
                    <label key={value} className="flex min-h-10 cursor-pointer items-center gap-2.5 text-ui">
                      <input
                        type="radio"
                        name="reason"
                        value={value}
                        checked={reason === value}
                        onChange={() => setReason(value)}
                        className="size-4 accent-ink"
                      />
                      {t(`reasons.${value}`)}
                    </label>
                  ))}
                </fieldset>
                {state === 'failed' && (
                  <p role="alert" className="text-small text-down">
                    {t('failed')}
                  </p>
                )}
                <div className="flex justify-end gap-2">
                  <Button variant="secondary" onClick={close}>
                    {t('cancel')}
                  </Button>
                  <Button type="submit" disabled={!reason || state === 'sending'} className="disabled:opacity-60">
                    {t('send')}
                  </Button>
                </div>
              </form>
            )}
            <button
              type="button"
              onClick={close}
              aria-label={states('dismiss')}
              className="absolute top-3.5 right-3.5 flex size-8 items-center justify-center rounded-pill text-ink-4 hover:text-ink"
            >
              <Icon name="close" size={16} strokeWidth={2} />
            </button>
          </div>
        )}
      </dialog>
    </>
  )
}
