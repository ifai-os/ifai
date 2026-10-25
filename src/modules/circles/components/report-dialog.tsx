'use client'

import { useTranslations } from 'next-intl'
import { useEffect, useId, useRef, useState, type FormEvent } from 'react'

import { Button } from '@/components/button'
import { Icon } from '@/components/icon'

import { reportReasons, type PostView, type ReportReason } from '../rules'
import { useCircles } from './circles-provider'

/** 「举报」: why, then a thank-you. Opens for one post at a time. */
export function ReportDialog({ post, onClose, onReported }: { post: PostView | null; onClose: () => void; onReported: (id: number) => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const open = post !== null

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
      className="m-auto w-[calc(100%-32px)] max-w-90 overflow-visible rounded-dialog bg-overlay p-0 text-ink shadow-float backdrop:bg-scrim"
    >
      {post && <ReportForm key={post.id} post={post} titleId={titleId} onClose={onClose} onReported={onReported} />}
    </dialog>
  )
}

function ReportForm({ post, titleId, onClose, onReported }: { post: PostView; titleId: string; onClose: () => void; onReported: (id: number) => void }) {
  const t = useTranslations('circles')
  const states = useTranslations('states')
  const { report } = useCircles()
  const [reason, setReason] = useState<ReportReason | null>(null)
  const [state, setState] = useState<'idle' | 'sending' | 'done' | 'failed'>('idle')

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!reason) return
    setState('sending')
    const ok = await report(post.id, reason)
    setState(ok ? 'done' : 'failed')
    if (ok) onReported(post.id)
  }

  return (
    <div className="relative flex flex-col gap-3 p-5">
      <h2 id={titleId} className="pr-8 text-title font-semibold">
        {t('reportTitle')}
      </h2>
      {state === 'done' ? (
        <>
          <p role="status" className="rounded-card bg-success-soft p-4 text-meta text-success-ink">
            {t('reportDone')}
          </p>
          <Button variant="secondary" onClick={onClose} className="self-end">
            {states('dismiss')}
          </Button>
        </>
      ) : (
        <form onSubmit={send} className="flex flex-col gap-3">
          <p className="text-meta text-ink-3">{t('reportBody')}</p>
          <fieldset className="flex flex-col">
            <legend className="pb-1 text-meta font-medium text-ink-2">{t('reportReason')}</legend>
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
              {t('reportFailed')}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>
              {t('cancel')}
            </Button>
            <Button type="submit" disabled={!reason || state === 'sending'} className="disabled:opacity-60">
              {t('reportSend')}
            </Button>
          </div>
        </form>
      )}
      <button
        type="button"
        onClick={onClose}
        aria-label={states('dismiss')}
        className="absolute top-3.5 right-3.5 flex size-8 items-center justify-center rounded-pill text-ink-4 hover:text-ink"
      >
        <Icon name="close" size={16} strokeWidth={2} />
      </button>
    </div>
  )
}
