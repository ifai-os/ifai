'use client'

import { useFormatter, useLocale, useTranslations } from 'next-intl'
import { useEffect, useId, useRef, useState, type FormEvent } from 'react'

import { Button, buttonClass } from '@/components/button'
import { tileTones } from '@/components/cards/initial-tile'
import { Icon } from '@/components/icon'
import { LocalTime } from '@/components/local-time'
import { StateShell } from '@/components/states/state-shell'
import { LoadFailed } from '@/components/states/load-failed'
import { Skeleton } from '@/components/states/skeleton'
import { skeletonDelayMs } from '@/components/states/timing'

import { reportReasons, type ReportReason, type ReviewView } from '../rules'
import { useReviews } from './reviews-provider'
import { Stars } from './stars'

/** Phones show the newest three until the reader asks for all (docs/specs/apps.md「设计稿」). */
const phoneCount = 3

/** The「评价」section of an app's page: the summary, the reader's own review, everyone else's, and「写评价」. */
export function ReviewsSection() {
  const t = useTranslations('reviews')
  const { app, status, page, loadingMore, moreFailed, loadMore, retry, write } = useReviews()
  const [expanded, setExpanded] = useState(false)
  const [reported, setReported] = useState<ReadonlySet<number>>(new Set())
  const [reporting, setReporting] = useState<ReviewView | null>(null)

  const mine = page?.mine ?? null
  const reviews = page?.reviews ?? []

  return (
    <section aria-labelledby="reviews" className="flex flex-col gap-3 md:gap-4">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          {/* Wider screens have it as a tab, so the heading is left to screen readers there. */}
          <h2 id="reviews" className="scroll-mt-20 text-h3 font-semibold md:sr-only">
            {t('title')}
          </h2>
          {page && page.summary.count > 0 && <SummaryLine className="text-meta text-ink-4" />}
        </div>
        {status === 'ready' && (
          <button type="button" onClick={write} className={buttonClass(mine ? 'secondary' : 'primary')}>
            {mine ? t('edit') : t('write')}
          </button>
        )}
      </div>

      {status === 'loading' && <ReviewsSkeleton />}
      {status === 'failed' && <LoadFailed onRetry={retry} title={t('failed')} />}

      {status === 'ready' && page && (
        <>
          {mine && <OwnReviewCard />}

          {reviews.length > 0 && (
            <ul className="flex flex-col rounded-card border border-line">
              {reviews.map((review, index) => (
                <ReviewItem
                  key={review.id}
                  review={review}
                  phoneHidden={!expanded && index >= phoneCount}
                  reported={reported.has(review.id)}
                  onReport={() => setReporting(review)}
                />
              ))}
            </ul>
          )}

          {!mine && reviews.length === 0 && (
            <StateShell icon="message" title={t('emptyTitle')} body={t('emptyBody', { name: app.name })} />
          )}

          {(reviews.length > phoneCount && !expanded) || page.next ? (
            <div className="flex flex-wrap items-center gap-3">
              {reviews.length > phoneCount && !expanded && (
                <button type="button" onClick={() => setExpanded(true)} className={buttonClass('secondary', 'md:hidden')}>
                  {t('showAll', { count: page.summary.count })}
                </button>
              )}
              {page.next && (
                <button
                  type="button"
                  onClick={loadMore}
                  disabled={loadingMore}
                  className={buttonClass('secondary', `disabled:opacity-60 ${expanded ? '' : 'max-md:hidden'}`)}
                >
                  {t('more')}
                </button>
              )}
              {moreFailed && (
                <span role="alert" className="text-meta text-down">
                  {t('failed')}
                </span>
              )}
            </div>
          ) : null}
        </>
      )}

      <ReportDialog
        review={reporting}
        onClose={() => setReporting(null)}
        onReported={(id) => setReported((current) => new Set(current).add(id))}
      />
    </section>
  )
}

/** ★★★★☆ 4.6 · 312 条评价, or just the count under five reviews. */
function SummaryLine({ className }: { className?: string }) {
  const t = useTranslations('reviews')
  const format = useFormatter()
  const { page } = useReviews()
  if (!page) return null
  const { count, average } = page.summary
  const value = average === null ? null : format.number(average, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
  return (
    <span className={`inline-flex flex-wrap items-center gap-x-1.5 ${className ?? ''}`}>
      {value !== null && (
        <>
          <Stars rating={average ?? 0} size={13} />
          <span aria-hidden="true" className="font-medium text-ink">
            {value}
          </span>
          <span className="sr-only">{t('rated', { value })}</span>
          <span aria-hidden="true">·</span>
        </>
      )}
      <span>{t('count', { count })}</span>
    </span>
  )
}

/** In the header next to the developer and category, on wider screens: the same summary, linking down to the reviews. */
export function ReviewSummary({ className }: { className?: string }) {
  const { page } = useReviews()
  if (!page || page.summary.count === 0) return null
  return (
    <span className={className}>
      <span aria-hidden="true"> · </span>
      <a href="#reviews" className="hover:text-ink">
        <SummaryLine />
      </a>
    </span>
  )
}

function ReviewsSkeleton() {
  const states = useTranslations('states')
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), skeletonDelayMs)
    return () => clearTimeout(timer)
  }, [])
  return (
    <div role="status" aria-label={states('loadingList')} className="min-h-40 rounded-card border border-line px-4 md:px-6">
      {visible &&
        [72, 58].map((width, index) => (
          <div key={width} className={`grid grid-cols-[36px_minmax(0,1fr)] gap-3.5 py-5 ${index > 0 ? 'border-t border-surface-2' : ''}`}>
            <Skeleton className="size-9 rounded-pill" />
            <span className="flex flex-col gap-2.5 pt-1">
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-3" style={{ width: `${width}%` }} />
            </span>
          </div>
        ))}
    </div>
  )
}

function Avatar({ name, tone }: { name: string; tone: number }) {
  const initial = ([...name.trim()][0] ?? '?').toUpperCase()
  return (
    <span
      aria-hidden="true"
      className={`flex size-9 flex-none items-center justify-center rounded-pill text-ui font-semibold ${tileTones[tone % tileTones.length]}`}
    >
      {initial}
    </span>
  )
}

/** 3 天前 for the last month, the date after that; the exact time on hover. */
function ReviewTime({ iso }: { iso: string }) {
  const format = useFormatter()
  const { loadedAt } = useReviews()
  const date = new Date(iso)
  const recent = loadedAt - date.getTime() < 30 * 24 * 60 * 60 * 1000
  if (!recent) return <LocalTime iso={iso} style="date" />
  return <time dateTime={iso}>{format.relativeTime(date, Math.max(loadedAt, date.getTime()))}</time>
}

/** Name, stars, when, then the review in its own language, or its machine translation when the reader asked for it. */
function ReviewBody({ review, translation = null }: { review: ReviewView; translation?: string | null }) {
  const t = useTranslations('reviews')
  const locale = useLocale()
  const name = review.author.name || t('anonymous')
  return (
    <>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-meta text-ink-4">
        <span className="font-medium text-ink-2">{name}</span>
        <Stars rating={review.rating} size={13} />
        <span className="sr-only">{t('stars', { rating: review.rating })}</span>
        <span>
          <span aria-hidden="true">· </span>
          <ReviewTime iso={review.createdAt} />
          {review.editedAt && ` · ${t('edited')}`}
        </span>
        {translation !== null && (
          <span className="inline-flex h-5.5 items-center gap-1 rounded-tag bg-surface-2 px-2 text-small text-ink-2">
            <Icon name="translate" size={12} strokeWidth={2} />
            {t('machineTranslated')}
          </span>
        )}
      </div>
      {/* Announced when the reader switches between the review and its translation. */}
      <p
        lang={translation === null ? review.lang : locale}
        aria-live={review.translatable ? 'polite' : undefined}
        className="text-body whitespace-pre-line wrap-anywhere"
      >
        {translation ?? review.body}
      </p>
    </>
  )
}

function ReviewItem({
  review,
  phoneHidden,
  reported,
  onReport,
}: {
  review: ReviewView
  phoneHidden: boolean
  reported: boolean
  onReport: () => void
}) {
  const t = useTranslations('reviews')
  const { translate } = useReviews()
  const name = review.author.name || t('anonymous')
  const [translation, setTranslation] = useState<string | null>(null)
  const [showing, setShowing] = useState(false)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)

  // 「翻译」reads the translation once; after that the button switches between it and the original.
  async function toggle() {
    if (showing || translation !== null) {
      setShowing(!showing)
      return
    }
    setLoading(true)
    setFailed(false)
    const text = await translate(review.id)
    setLoading(false)
    if (text === null) {
      setFailed(true)
      return
    }
    setTranslation(text)
    setShowing(true)
  }

  return (
    <li
      className={`grid grid-cols-[36px_minmax(0,1fr)] gap-3.5 border-b border-surface-2 px-4 py-4 last:border-b-0 md:px-6 md:py-5 ${
        phoneHidden ? 'max-md:hidden' : ''
      }`}
    >
      <Avatar name={name} tone={review.author.tone} />
      <div className="flex min-w-0 flex-col gap-1.5">
        <ReviewBody review={review} translation={showing ? translation : null} />
        <div className="flex flex-wrap items-center gap-x-4">
          {review.translatable && (
            <button
              type="button"
              onClick={toggle}
              disabled={loading}
              aria-label={showing ? t('originalName', { name }) : t('translateName', { name })}
              className="-my-1.5 h-8 text-small font-medium text-link hover:underline disabled:opacity-60"
            >
              {showing ? t('showOriginal') : loading ? t('translating') : t('translate')}
            </button>
          )}
          <button
            type="button"
            onClick={onReport}
            disabled={reported}
            aria-label={reported ? undefined : t('reportName', { name })}
            className="-my-1.5 h-8 text-small text-ink-4 hover:text-ink disabled:hover:text-ink-4"
          >
            {reported ? t('reported') : t('report')}
          </button>
          {failed && (
            <span role="alert" className="text-small text-down">
              {t('translateFailed')}
            </span>
          )}
        </div>
      </div>
    </li>
  )
}

/** The reader's own review, above everyone else's, with「修改」and「删除」; it says so when the site owner hid it. */
function OwnReviewCard() {
  const t = useTranslations('reviews')
  const { page, write, remove } = useReviews()
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const mine = page?.mine
  if (!mine) return null
  const name = mine.author.name || t('anonymous')

  async function confirmDelete() {
    setBusy(true)
    setFailed(false)
    const ok = await remove()
    setBusy(false)
    if (!ok) setFailed(true)
  }

  const link = 'h-8 text-meta text-link hover:underline disabled:opacity-60'
  return (
    <div className="grid grid-cols-[36px_minmax(0,1fr)] gap-3.5 rounded-card border border-line bg-surface px-4 py-4 md:px-6 md:py-5">
      <Avatar name={name} tone={mine.author.tone} />
      <div className="flex min-w-0 flex-col gap-1.5">
        <span className="text-small font-medium text-ink-2">{t('mine')}</span>
        {mine.hidden && <p className="rounded-thumb bg-warn px-3 py-2 text-meta text-warn-ink">{t('hiddenNote')}</p>}
        <ReviewBody review={mine} />
        {confirming ? (
          <div role="group" aria-label={t('deleteConfirm')} className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="text-meta text-ink-2">{t('deleteConfirm')}</span>
            <button type="button" onClick={confirmDelete} disabled={busy} className={`${link} text-down`}>
              {t('deleteYes')}
            </button>
            <button type="button" onClick={() => setConfirming(false)} disabled={busy} className={link}>
              {t('cancel')}
            </button>
          </div>
        ) : (
          <div className="flex gap-4">
            <button type="button" onClick={write} className={link}>
              {t('edit')}
            </button>
            <button type="button" onClick={() => setConfirming(true)} className={link}>
              {t('delete')}
            </button>
          </div>
        )}
        {failed && (
          <span role="alert" className="text-small text-down">
            {t('errors.failed')}
          </span>
        )}
      </div>
    </div>
  )
}

/** 「举报」: why, then a thank-you. Opens for one review at a time. */
function ReportDialog({ review, onClose, onReported }: { review: ReviewView | null; onClose: () => void; onReported: (id: number) => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const open = review !== null

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
      className="m-auto w-[calc(100%-32px)] max-w-90 overflow-visible rounded-dialog bg-bg p-0 text-ink shadow-float backdrop:bg-scrim"
    >
      {review && <ReportForm key={review.id} review={review} titleId={titleId} onClose={onClose} onReported={onReported} />}
    </dialog>
  )
}

function ReportForm({
  review,
  titleId,
  onClose,
  onReported,
}: {
  review: ReviewView
  titleId: string
  onClose: () => void
  onReported: (id: number) => void
}) {
  const t = useTranslations('reviews')
  const states = useTranslations('states')
  const { report } = useReviews()
  const [reason, setReason] = useState<ReportReason | null>(null)
  const [state, setState] = useState<'idle' | 'sending' | 'done' | 'failed'>('idle')

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!reason) return
    setState('sending')
    const ok = await report(review.id, reason)
    setState(ok ? 'done' : 'failed')
    if (ok) onReported(review.id)
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
