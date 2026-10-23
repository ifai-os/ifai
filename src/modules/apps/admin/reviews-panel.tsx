'use client'

import { Button, toast, useDocumentInfo, useTranslation } from '@payloadcms/ui'
import { useCallback, useEffect, useState } from 'react'

import type { AdminReview } from '../reviews/admin'
import type { AdminReviewsResponse } from '../reviews/endpoints'
import type { ReportReason } from '../reviews/rules'

// The back office is for the site owner; its text follows Payload's own admin language (zh / en).
const text = {
  zh: {
    saveFirst: '保存并发布后，读者可以在详情页写评价。',
    none: '还没有评价。',
    summary: (shown: number, hidden: number) => `${shown} 条显示中${hidden > 0 ? `，${hidden} 条已隐藏` : ''}。`,
    stars: (rating: number) => `${rating} 星`,
    anonymous: '（没有名字）',
    edited: '改过',
    hiddenBadge: '已隐藏',
    reported: (open: number, total: number) => (open > 0 ? `被举报 ${open} 次，待处理` : `被举报过 ${total} 次，已处理`),
    reasons: { spam: '广告或刷评', abuse: '骚扰或冒犯', offTopic: '和这个应用无关', other: '其他' } satisfies Record<ReportReason, string>,
    hide: '隐藏',
    show: '恢复显示',
    keep: '保留，举报不成立',
    hidden: '已隐藏，只有作者自己能看到。',
    shown: '已恢复显示。',
    kept: '已保留，举报标为已处理。',
    failedRequest: '操作失败',
  },
  en: {
    saveFirst: 'Once saved and published, readers can review it on its page.',
    none: 'No reviews yet.',
    summary: (shown: number, hidden: number) => `${shown} shown${hidden > 0 ? `, ${hidden} hidden` : ''}.`,
    stars: (rating: number) => `${rating} stars`,
    anonymous: '(no name)',
    edited: 'edited',
    hiddenBadge: 'Hidden',
    reported: (open: number, total: number) => (open > 0 ? `Reported ${open} times, not dealt with` : `Reported ${total} times, dealt with`),
    reasons: { spam: 'spam or fake', abuse: 'abusive', offTopic: 'not about this app', other: 'other' } satisfies Record<ReportReason, string>,
    hide: 'Hide',
    show: 'Show again',
    keep: 'Keep it, the reports were wrong',
    hidden: 'Hidden; only its author sees it now.',
    shown: 'Shown again.',
    kept: 'Kept; its reports are marked as dealt with.',
    failedRequest: 'Failed',
  },
}

const box = {
  marginBottom: 'var(--base)',
  padding: 'calc(var(--base) * 0.75)',
  border: '1px solid var(--theme-elevation-150)',
  borderRadius: 'var(--style-radius-m)',
  lineHeight: 1.5,
} as const

const row = {
  padding: 'calc(var(--base) * 0.5) 0',
  borderTop: '1px solid var(--theme-elevation-100)',
} as const

const flagged = { color: 'var(--theme-error-500)' } as const

type Change = { status: 'hidden' | 'shown' } | { keep: true }

/** The「评价」tab of an app: every review, newest first, with its reports; hide, show again, or keep a reported one. */
export function ReviewsPanel() {
  const { id } = useDocumentInfo()
  const { i18n } = useTranslation()
  const t = i18n.language.startsWith('zh') ? text.zh : text.en
  const [reviews, setReviews] = useState<AdminReview[] | null>(null)
  const [busy, setBusy] = useState<number | null>(null)

  const load = useCallback(async (): Promise<AdminReview[] | null> => {
    const response = await fetch(`/api/apps/${id}/reviews`, { credentials: 'same-origin' })
    return response.ok ? ((await response.json()) as AdminReviewsResponse).reviews : null
  }, [id])

  useEffect(() => {
    if (id) void load().then((next) => next && setReviews(next))
  }, [id, load])

  if (!id) return <div style={box}>{t.saveFirst}</div>

  async function moderate(review: AdminReview, change: Change) {
    setBusy(review.id)
    try {
      const response = await fetch(`/api/apps/${id}/reviews/${review.id}`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(change),
      })
      const data = (await response.json()) as { ok?: boolean; error?: string }
      if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`)
      toast.success('keep' in change ? t.kept : change.status === 'hidden' ? t.hidden : t.shown)
      const next = await load()
      if (next) setReviews(next)
    } catch (error) {
      toast.error(`${t.failedRequest}: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setBusy(null)
    }
  }

  if (reviews === null) return <div style={box}>…</div>
  if (reviews.length === 0) return <div style={box}>{t.none}</div>

  const hiddenCount = reviews.filter((review) => review.status === 'hidden').length
  const when = (iso: string) => new Date(iso).toLocaleString(i18n.language)

  return (
    <div style={box}>
      <p style={{ margin: '0 0 0.5em' }}>{t.summary(reviews.length - hiddenCount, hiddenCount)}</p>
      {reviews.map((review) => (
        <div key={review.id} style={row}>
          <p style={{ margin: 0 }}>
            <strong>{'★'.repeat(review.rating) + '☆'.repeat(5 - review.rating)}</strong> <small>({t.stars(review.rating)})</small>{' '}
            {review.author.name || t.anonymous} <small>&lt;{review.author.email}&gt;</small> ·{' '}
            <small>
              {when(review.createdAt)}
              {review.editedAt ? ` · ${t.edited} ${when(review.editedAt)}` : ''}
            </small>
            {review.status === 'hidden' && <strong> · {t.hiddenBadge}</strong>}
          </p>
          <p lang={review.lang} style={{ margin: '0.25em 0', whiteSpace: 'pre-line', wordBreak: 'break-word' }}>
            {review.body}
          </p>
          {review.reports.total > 0 && (
            <p style={{ margin: '0 0 0.25em', ...(review.reports.open > 0 ? flagged : {}) }}>
              {t.reported(review.reports.open, review.reports.total)}：
              {Object.entries(review.reports.reasons)
                .map(([reason, times]) => `${t.reasons[reason as ReportReason]} × ${times}`)
                .join('、')}
            </p>
          )}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5em' }}>
            <Button
              buttonStyle="secondary"
              size="small"
              margin={false}
              disabled={busy !== null}
              onClick={() => moderate(review, { status: review.status === 'hidden' ? 'shown' : 'hidden' })}
            >
              {review.status === 'hidden' ? t.show : t.hide}
            </Button>
            {review.status === 'shown' && review.reports.open > 0 && (
              <Button buttonStyle="secondary" size="small" margin={false} disabled={busy !== null} onClick={() => moderate(review, { keep: true })}>
                {t.keep}
              </Button>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
