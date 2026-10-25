'use client'

import { Button, toast, useDocumentInfo, useTranslation } from '@payloadcms/ui'
import { useCallback, useEffect, useState } from 'react'

import { localizePath } from '@/i18n/config'

import type { AdminComment } from '../admin'
import type { AdminCommentsResponse } from '../endpoints'
import type { ReportReason } from '../rules'

// The back office is for the site owner; its text follows Payload's own admin language (zh / en).
const text = {
  zh: {
    saveFirst: '保存后，读者可以在这个圈子的动态下面评论。',
    none: '还没有评论。',
    summary: (shown: number, hidden: number) => `${shown} 条显示中${hidden > 0 ? `，${hidden} 条已隐藏` : ''}。只列最近 200 条。`,
    anonymous: '（没有名字）',
    under: '评论动态',
    reply: '回复',
    underHidden: '所在的评论已隐藏，读者也看不到这条回复',
    noText: '（只有图片或视频）',
    hiddenBadge: '已隐藏',
    reported: (open: number, total: number) => (open > 0 ? `被举报 ${open} 次，待处理` : `被举报过 ${total} 次，已处理`),
    reasons: { spam: '广告或刷屏', abuse: '骚扰或冒犯', offTopic: '和这个圈子无关', other: '其他' } satisfies Record<ReportReason, string>,
    hide: '隐藏',
    show: '恢复显示',
    keep: '保留，举报不成立',
    hidden: '已隐藏，只有作者自己能看到；它下面的回复也不再显示。',
    shown: '已恢复显示。',
    kept: '已保留，举报标为已处理。',
    failedRequest: '操作失败',
    separator: '、',
    colon: '：',
  },
  en: {
    saveFirst: 'Once saved, readers can comment on the posts in this circle.',
    none: 'No comments yet.',
    summary: (shown: number, hidden: number) => `${shown} shown${hidden > 0 ? `, ${hidden} hidden` : ''}. Only the latest 200 are listed.`,
    anonymous: '(no name)',
    under: 'On the post',
    reply: 'Reply',
    underHidden: 'the comment it is under is hidden, so readers do not see this reply either',
    noText: '(pictures or a video only)',
    hiddenBadge: 'Hidden',
    reported: (open: number, total: number) => (open > 0 ? `Reported ${open} times, not dealt with` : `Reported ${total} times, dealt with`),
    reasons: { spam: 'spam or flooding', abuse: 'abusive', offTopic: 'not about this circle', other: 'other' } satisfies Record<ReportReason, string>,
    hide: 'Hide',
    show: 'Show again',
    keep: 'Keep it, the reports were wrong',
    hidden: 'Hidden; only its author sees it now, and the replies under it are out of sight too.',
    shown: 'Shown again.',
    kept: 'Kept; its reports are marked as dealt with.',
    failedRequest: 'Failed',
    separator: ', ',
    colon: ': ',
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

/** The「评论」tab of a circle: its latest comments and replies, newest first, with their reports; hide, show again, or keep a reported one. */
export function CommentsPanel() {
  const { id } = useDocumentInfo()
  const { i18n } = useTranslation()
  const t = i18n.language.startsWith('zh') ? text.zh : text.en
  const [comments, setComments] = useState<AdminComment[] | null>(null)
  const [busy, setBusy] = useState<number | null>(null)

  const load = useCallback(async (): Promise<AdminComment[] | null> => {
    const response = await fetch(`/api/circles/${id}/comments`, { credentials: 'same-origin' })
    return response.ok ? ((await response.json()) as AdminCommentsResponse).comments : null
  }, [id])

  useEffect(() => {
    if (id) void load().then((next) => next && setComments(next))
  }, [id, load])

  if (!id) return <div style={box}>{t.saveFirst}</div>

  async function moderate(comment: AdminComment, change: Change) {
    setBusy(comment.id)
    try {
      const response = await fetch(`/api/circles/${id}/comments/${comment.id}`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(change),
      })
      const data = (await response.json()) as { ok?: boolean; error?: string }
      if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`)
      toast.success('keep' in change ? t.kept : change.status === 'hidden' ? t.hidden : t.shown)
      const next = await load()
      if (next) setComments(next)
    } catch (error) {
      toast.error(`${t.failedRequest}: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setBusy(null)
    }
  }

  if (comments === null) return <div style={box}>…</div>
  if (comments.length === 0) return <div style={box}>{t.none}</div>

  const hiddenCount = comments.filter((comment) => comment.status === 'hidden').length
  const when = (iso: string) => new Date(iso).toLocaleString(i18n.language)
  // The post's page on the site, in the back office's language.
  const postHref = (postId: number) => localizePath(i18n.language.startsWith('zh') ? 'zh-Hans' : 'en', `/circles/p/${postId}`)

  return (
    <div style={box}>
      <p style={{ margin: '0 0 0.5em' }}>{t.summary(comments.length - hiddenCount, hiddenCount)}</p>
      {comments.map((comment) => (
        <div key={comment.id} style={row}>
          <p style={{ margin: 0 }}>
            {comment.author.name || t.anonymous} <small>&lt;{comment.author.email}&gt;</small> · <small>{when(comment.createdAt)}</small>
            {comment.reply && <small> · {t.reply}</small>}
            {comment.underHidden && <small> · {t.underHidden}</small>}
            {comment.status === 'hidden' && <strong> · {t.hiddenBadge}</strong>}
          </p>
          <p style={{ margin: '0.25em 0 0', wordBreak: 'break-word' }}>
            <small>
              {t.under}
              {t.colon}
              <a href={postHref(comment.post.id)} target="_blank" rel="noreferrer">
                {comment.post.excerpt || t.noText}
              </a>
            </small>
          </p>
          <p lang={comment.lang} style={{ margin: '0.25em 0', whiteSpace: 'pre-line', wordBreak: 'break-word' }}>
            {comment.body}
          </p>
          {comment.reports.total > 0 && (
            <p style={{ margin: '0 0 0.25em', ...(comment.reports.open > 0 ? flagged : {}) }}>
              {t.reported(comment.reports.open, comment.reports.total)}
              {t.colon}
              {Object.entries(comment.reports.reasons)
                .map(([reason, times]) => `${t.reasons[reason as ReportReason]} × ${times}`)
                .join(t.separator)}
            </p>
          )}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5em' }}>
            <Button
              buttonStyle="secondary"
              size="small"
              margin={false}
              disabled={busy !== null}
              onClick={() => moderate(comment, { status: comment.status === 'hidden' ? 'shown' : 'hidden' })}
            >
              {comment.status === 'hidden' ? t.show : t.hide}
            </Button>
            {comment.status === 'shown' && comment.reports.open > 0 && (
              <Button buttonStyle="secondary" size="small" margin={false} disabled={busy !== null} onClick={() => moderate(comment, { keep: true })}>
                {t.keep}
              </Button>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
