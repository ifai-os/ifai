'use client'

import { useTranslation } from '@payloadcms/ui'
import { useEffect, useState } from 'react'

import type { OpenReportsResponse } from '../endpoints'

// The back office is for the site owner; its text follows Payload's own admin language (zh / en).
const text = {
  zh: {
    title: (posts: number, comments: number) =>
      `有 ${[posts > 0 && `${posts} 条动态`, comments > 0 && `${comments} 条评论`].filter(Boolean).join('、')}被举报，还没处理`,
    item: (reports: number) => `被举报 ${reports} 次`,
    comment: '评论',
    how: '打开圈子，在「动态」或「评论」标签里隐藏，或者保留。',
  },
  en: {
    title: (posts: number, comments: number) =>
      `${[posts > 0 && `${posts} reported posts`, comments > 0 && `${comments} reported comments`].filter(Boolean).join(' and ')} nobody has dealt with yet`,
    item: (reports: number) => `reported ${reports} times`,
    comment: 'comment',
    how: 'Open the circle and hide or keep them in its Posts or Comments tab.',
  },
}

const box = {
  marginBottom: 'var(--base)',
  padding: 'calc(var(--base) * 0.75)',
  border: '1px solid var(--theme-error-500)',
  borderRadius: 'var(--style-radius-m)',
  lineHeight: 1.5,
} as const

/** Above the circles list, only when there are any: reported posts and comments still waiting for the site owner. */
export function PostReports() {
  const { i18n } = useTranslation()
  const t = i18n.language.startsWith('zh') ? text.zh : text.en
  const [reports, setReports] = useState<OpenReportsResponse | null>(null)

  useEffect(() => {
    void fetch('/api/circles/open-reports', { credentials: 'same-origin' })
      .then((response) => (response.ok ? (response.json() as Promise<OpenReportsResponse>) : null))
      .then(setReports)
      .catch(() => setReports(null))
  }, [])

  if (!reports || reports.posts.total + reports.comments.total === 0) return null

  return (
    <div style={box} role="status">
      <strong>{t.title(reports.posts.total, reports.comments.total)}</strong>
      <ul style={{ margin: '0.25em 0', paddingLeft: '1.25em' }}>
        {reports.posts.items.map((item) => (
          <li key={`post-${item.postId}`} style={{ wordBreak: 'break-word' }}>
            <a href={`/admin/collections/circles/${item.circleId}`}>{item.circleName}</a>：「{item.excerpt}」 <small>{t.item(item.reports)}</small>
          </li>
        ))}
        {reports.comments.items.map((item) => (
          <li key={`comment-${item.commentId}`} style={{ wordBreak: 'break-word' }}>
            <a href={`/admin/collections/circles/${item.circleId}`}>{item.circleName}</a>
            {` · ${t.comment}`}：「{item.excerpt}」 <small>{t.item(item.reports)}</small>
          </li>
        ))}
      </ul>
      <small>{t.how}</small>
    </div>
  )
}
