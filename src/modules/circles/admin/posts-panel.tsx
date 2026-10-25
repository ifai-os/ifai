'use client'

import { Button, toast, useDocumentInfo, useTranslation } from '@payloadcms/ui'
import { useCallback, useEffect, useState } from 'react'

import type { AdminPost } from '../admin'
import type { AdminPostsResponse } from '../endpoints'
import type { ReportReason, VideoProvider } from '../rules'

// The back office is for the site owner; its text follows Payload's own admin language (zh / en).
const text = {
  zh: {
    saveFirst: '保存后，读者可以在圈子页往这个圈子发动态。',
    none: '还没有动态。',
    summary: (shown: number, hidden: number) => `${shown} 条显示中${hidden > 0 ? `，${hidden} 条已隐藏` : ''}。只列最近 200 条。`,
    anonymous: '（没有名字）',
    reactions: (people: number) => `${people} 人回应`,
    comments: (count: number) => `${count} 条评论`,
    hiddenBadge: '已隐藏',
    reported: (open: number, total: number) => (open > 0 ? `被举报 ${open} 次，待处理` : `被举报过 ${total} 次，已处理`),
    reasons: { spam: '广告或刷屏', abuse: '骚扰或冒犯', offTopic: '和这个圈子无关', other: '其他' } satisfies Record<ReportReason, string>,
    hide: '隐藏',
    show: '恢复显示',
    keep: '保留，举报不成立',
    hidden: '已隐藏，只有作者自己能看到。',
    shown: '已恢复显示。',
    kept: '已保留，举报标为已处理。',
    failedRequest: '操作失败',
    separator: '、',
    colon: '：',
    image: (index: number) => `第 ${index} 张图片（新窗口打开原图）`,
    video: '视频',
    noTitle: '（没读到标题）',
    providers: { youtube: 'YouTube', bilibili: '哔哩哔哩', vimeo: 'Vimeo' } satisfies Record<VideoProvider, string>,
  },
  en: {
    saveFirst: 'Once saved, readers can post in this circle on the circles page.',
    none: 'No posts yet.',
    summary: (shown: number, hidden: number) => `${shown} shown${hidden > 0 ? `, ${hidden} hidden` : ''}. Only the latest 200 are listed.`,
    anonymous: '(no name)',
    reactions: (people: number) => `${people} reacted`,
    comments: (count: number) => `${count} ${count === 1 ? 'comment' : 'comments'}`,
    hiddenBadge: 'Hidden',
    reported: (open: number, total: number) => (open > 0 ? `Reported ${open} times, not dealt with` : `Reported ${total} times, dealt with`),
    reasons: { spam: 'spam or flooding', abuse: 'abusive', offTopic: 'not about this circle', other: 'other' } satisfies Record<ReportReason, string>,
    hide: 'Hide',
    show: 'Show again',
    keep: 'Keep it, the reports were wrong',
    hidden: 'Hidden; only its author sees it now.',
    shown: 'Shown again.',
    kept: 'Kept; its reports are marked as dealt with.',
    failedRequest: 'Failed',
    separator: ', ',
    colon: ': ',
    image: (index: number) => `Picture ${index} (opens the full size in a new tab)`,
    video: 'Video',
    noTitle: '(no title could be read)',
    providers: { youtube: 'YouTube', bilibili: 'Bilibili', vimeo: 'Vimeo' } satisfies Record<VideoProvider, string>,
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

const thumb = { display: 'block', width: 64, height: 64, objectFit: 'cover', borderRadius: 'var(--style-radius-s)' } as const

type Change = { status: 'hidden' | 'shown' } | { keep: true }

/** The「动态」tab of a circle: every post, newest first, with its pictures, video, comment count and reports; hide, show again, or keep a reported one. */
export function PostsPanel() {
  const { id } = useDocumentInfo()
  const { i18n } = useTranslation()
  const t = i18n.language.startsWith('zh') ? text.zh : text.en
  const [posts, setPosts] = useState<AdminPost[] | null>(null)
  const [busy, setBusy] = useState<number | null>(null)

  const load = useCallback(async (): Promise<AdminPost[] | null> => {
    const response = await fetch(`/api/circles/${id}/posts`, { credentials: 'same-origin' })
    return response.ok ? ((await response.json()) as AdminPostsResponse).posts : null
  }, [id])

  useEffect(() => {
    if (id) void load().then((next) => next && setPosts(next))
  }, [id, load])

  if (!id) return <div style={box}>{t.saveFirst}</div>

  async function moderate(post: AdminPost, change: Change) {
    setBusy(post.id)
    try {
      const response = await fetch(`/api/circles/${id}/posts/${post.id}`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(change),
      })
      const data = (await response.json()) as { ok?: boolean; error?: string }
      if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`)
      toast.success('keep' in change ? t.kept : change.status === 'hidden' ? t.hidden : t.shown)
      const next = await load()
      if (next) setPosts(next)
    } catch (error) {
      toast.error(`${t.failedRequest}: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setBusy(null)
    }
  }

  if (posts === null) return <div style={box}>…</div>
  if (posts.length === 0) return <div style={box}>{t.none}</div>

  const hiddenCount = posts.filter((post) => post.status === 'hidden').length
  const when = (iso: string) => new Date(iso).toLocaleString(i18n.language)

  return (
    <div style={box}>
      <p style={{ margin: '0 0 0.5em' }}>{t.summary(posts.length - hiddenCount, hiddenCount)}</p>
      {posts.map((post) => (
        <div key={post.id} style={row}>
          <p style={{ margin: 0 }}>
            {post.author.name || t.anonymous} <small>&lt;{post.author.email}&gt;</small> · <small>{when(post.createdAt)}</small>
            {post.reactions > 0 && <small> · {t.reactions(post.reactions)}</small>}
            {post.comments > 0 && <small> · {t.comments(post.comments)}</small>}
            {post.status === 'hidden' && <strong> · {t.hiddenBadge}</strong>}
          </p>
          {post.body && (
            <p lang={post.lang} style={{ margin: '0.25em 0', whiteSpace: 'pre-line', wordBreak: 'break-word' }}>
              {post.body}
            </p>
          )}
          {post.images.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, margin: '0.25em 0' }}>
              {post.images.map((image, index) => (
                <a key={image.full} href={image.full} target="_blank" rel="noreferrer" aria-label={t.image(index + 1)} title={t.image(index + 1)}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- a sized copy made on upload */}
                  <img src={image.square} alt="" width={64} height={64} loading="lazy" style={thumb} />
                </a>
              ))}
            </div>
          )}
          {post.video && (
            <p style={{ margin: '0.25em 0', wordBreak: 'break-word' }}>
              {t.video}
              {t.colon}
              {t.providers[post.video.provider]} ·{' '}
              <a href={post.video.url} target="_blank" rel="noreferrer">
                {post.video.title ?? t.noTitle}
              </a>
            </p>
          )}
          {post.reports.total > 0 && (
            <p style={{ margin: '0 0 0.25em', ...(post.reports.open > 0 ? flagged : {}) }}>
              {t.reported(post.reports.open, post.reports.total)}
              {t.colon}
              {Object.entries(post.reports.reasons)
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
              onClick={() => moderate(post, { status: post.status === 'hidden' ? 'shown' : 'hidden' })}
            >
              {post.status === 'hidden' ? t.show : t.hide}
            </Button>
            {post.status === 'shown' && post.reports.open > 0 && (
              <Button buttonStyle="secondary" size="small" margin={false} disabled={busy !== null} onClick={() => moderate(post, { keep: true })}>
                {t.keep}
              </Button>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
