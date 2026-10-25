'use client'

import { useTranslations } from 'next-intl'
import { useEffect, useId, useRef, useState, type FormEvent } from 'react'

import { Button } from '@/components/button'
import { Icon } from '@/components/icon'

import { reviewRules, textLength, type OwnReview } from '../rules'
import type { SubmitResult } from './reviews-provider'
import { StarIcon } from './stars'

/** What the review form sends. */
export type ReviewDraft = { rating: number; body: string; name: string }

type ReviewDialogProps = {
  open: boolean
  onClose: () => void
  appName: string
  /** The member's review of the app, to change; null to write one. */
  mine: OwnReview | null
  /** The member's name as it is now. */
  name: string
  onSubmit: (draft: ReviewDraft) => Promise<SubmitResult>
}

/** Writing or changing a review: stars, the text and the name shown with it. A native modal dialog, so focus stays inside and Escape closes it. */
export function ReviewDialog({ open, onClose, ...form }: ReviewDialogProps) {
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
      {open && <ReviewForm {...form} titleId={titleId} onClose={onClose} />}
    </dialog>
  )
}

type ErrorKey = 'rating' | 'body' | 'tooLong' | 'name' | 'dailyLimit' | 'failed'

const ratings = [1, 2, 3, 4, 5] as const

function ReviewForm({ appName, mine, name: currentName, onSubmit, onClose, titleId }: Omit<ReviewDialogProps, 'open'> & { titleId: string }) {
  const t = useTranslations('reviews')
  const states = useTranslations('states')
  const [rating, setRating] = useState<number>(mine?.rating ?? 0)
  const [hovered, setHovered] = useState(0)
  const [body, setBody] = useState(mine?.body ?? '')
  const [name, setName] = useState(currentName)
  const [error, setError] = useState<ErrorKey | null>(null)
  const [sending, setSending] = useState(false)
  const ids = { body: useId(), count: useId(), name: useId(), hint: useId(), error: useId() }

  const length = textLength(body.trim())
  const tooLong = length > reviewRules.maxBody
  const shown = hovered || rating

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const text = body.trim()
    const signature = [...name.trim()].slice(0, reviewRules.maxName).join('')
    const problem: ErrorKey | null = !rating ? 'rating' : !text ? 'body' : tooLong ? 'tooLong' : !signature ? 'name' : null
    if (problem) {
      setError(problem)
      return
    }
    setSending(true)
    setError(null)
    const result = await onSubmit({ rating, body: text, name: signature })
    setSending(false)
    if (result === 'ok') onClose()
    else if (result !== 'sign-in') {
      setError(
        result === 'daily-limit'
          ? 'dailyLimit'
          : result === 'body-too-long'
            ? 'tooLong'
            : result === 'empty-body'
              ? 'body'
              : result === 'invalid-rating'
                ? 'rating'
                : 'failed',
      )
    }
  }

  return (
    <form onSubmit={send} noValidate className="relative flex flex-col gap-4 p-5">
      <h2 id={titleId} className="pr-8 text-title font-semibold wrap-anywhere">
        {mine ? t('editTitle', { name: appName }) : t('writeTitle', { name: appName })}
      </h2>

      <fieldset className="flex flex-col gap-1">
        <legend className="pb-1 text-meta font-medium text-ink-2">{t('ratingLegend')}</legend>
        <div className="flex items-center gap-0.5" onMouseLeave={() => setHovered(0)}>
          {ratings.map((value) => (
            <label key={value} className="cursor-pointer" onMouseEnter={() => setHovered(value)}>
              <input
                type="radio"
                name="rating"
                value={value}
                checked={rating === value}
                onChange={() => {
                  setRating(value)
                  if (error === 'rating') setError(null)
                }}
                className="peer sr-only"
              />
              <span className="flex size-10 items-center justify-center rounded-thumb text-star peer-focus-visible:outline-2 peer-focus-visible:outline-link">
                <StarIcon size={28} filled={value <= shown} />
              </span>
              <span className="sr-only">{t('ratingOption', { rating: value, label: t(`ratingLabels.${value}`) })}</span>
            </label>
          ))}
          <span aria-hidden="true" className="pl-2 text-meta text-ink-3">
            {shown > 0 && t(`ratingLabels.${shown as (typeof ratings)[number]}`)}
          </span>
        </div>
      </fieldset>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={ids.body} className="text-meta font-medium text-ink-2">
          {t('bodyLabel')}
        </label>
        <textarea
          id={ids.body}
          value={body}
          onChange={(event) => {
            setBody(event.target.value)
            if (error === 'body' || error === 'tooLong') setError(null)
          }}
          rows={5}
          placeholder={t('bodyPlaceholder')}
          aria-invalid={error === 'body' || tooLong || undefined}
          aria-describedby={`${ids.count}${error ? ` ${ids.error}` : ''}`}
          className={`min-h-32 resize-y rounded-thumb border bg-surface px-3.5 py-3 text-body text-ink outline-none placeholder:text-ink-4 focus:border-ink-4 ${
            tooLong || error === 'body' ? 'border-down' : 'border-surface-2'
          }`}
        />
        <span id={ids.count} className={`self-end text-small ${tooLong ? 'text-down' : 'text-ink-4'}`}>
          {t('charCount', { count: length, max: reviewRules.maxBody })}
        </span>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={ids.name} className="text-meta font-medium text-ink-2">
          {t('nameLabel')}
        </label>
        <input
          id={ids.name}
          value={name}
          onChange={(event) => {
            setName(event.target.value)
            if (error === 'name') setError(null)
          }}
          maxLength={reviewRules.maxName}
          autoComplete="nickname"
          aria-invalid={error === 'name' || undefined}
          aria-describedby={`${ids.hint}${error ? ` ${ids.error}` : ''}`}
          className={`h-11 rounded-thumb border bg-surface px-3.5 text-ui text-ink outline-none focus:border-ink-4 ${
            error === 'name' ? 'border-down' : 'border-surface-2'
          }`}
        />
        <span id={ids.hint} className="text-small text-ink-4">
          {t('nameHint')}
        </span>
      </div>

      {error && (
        <p id={ids.error} role="alert" className="text-small text-down">
          {t(`errors.${error}`, { max: reviewRules.maxBody, limit: reviewRules.dailyLimit })}
        </p>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          {t('cancel')}
        </Button>
        <Button type="submit" disabled={sending} className="disabled:opacity-60">
          {mine ? (sending ? t('saving') : t('save')) : sending ? t('sending') : t('publish')}
        </Button>
      </div>

      {/* Last in the DOM, so opening the dialog focuses the stars rather than this. */}
      <button
        type="button"
        onClick={onClose}
        aria-label={states('dismiss')}
        className="absolute top-3.5 right-3.5 flex size-8 items-center justify-center rounded-pill text-ink-4 hover:text-ink"
      >
        <Icon name="close" size={16} strokeWidth={2} />
      </button>
    </form>
  )
}
