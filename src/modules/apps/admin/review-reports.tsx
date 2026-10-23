'use client'

import { useTranslation } from '@payloadcms/ui'
import { useEffect, useState } from 'react'

import type { OpenReportsResponse } from '../reviews/endpoints'

// The back office is for the site owner; its text follows Payload's own admin language (zh / en).
const text = {
  zh: {
    title: (total: number) => `有 ${total} 条评价被举报，还没处理`,
    item: (reports: number) => `被举报 ${reports} 次`,
    how: '打开应用，在「评价」标签里隐藏，或者保留。',
  },
  en: {
    title: (total: number) => `${total} reported reviews nobody has dealt with yet`,
    item: (reports: number) => `reported ${reports} times`,
    how: 'Open the app and hide or keep them in its Reviews tab.',
  },
}

const box = {
  marginBottom: 'var(--base)',
  padding: 'calc(var(--base) * 0.75)',
  border: '1px solid var(--theme-error-500)',
  borderRadius: 'var(--style-radius-m)',
  lineHeight: 1.5,
} as const

/** Above the apps list, only when there are any: reported reviews still waiting for the site owner. */
export function ReviewReports() {
  const { i18n } = useTranslation()
  const t = i18n.language.startsWith('zh') ? text.zh : text.en
  const [reports, setReports] = useState<OpenReportsResponse | null>(null)

  useEffect(() => {
    void fetch('/api/apps/review-reports', { credentials: 'same-origin' })
      .then((response) => (response.ok ? (response.json() as Promise<OpenReportsResponse>) : null))
      .then(setReports)
      .catch(() => setReports(null))
  }, [])

  if (!reports || reports.total === 0) return null

  return (
    <div style={box} role="status">
      <strong>{t.title(reports.total)}</strong>
      <ul style={{ margin: '0.25em 0', paddingLeft: '1.25em' }}>
        {reports.items.map((item) => (
          <li key={item.reviewId} style={{ wordBreak: 'break-word' }}>
            <a href={`/admin/collections/apps/${item.appId}`}>{item.appName}</a>：「{item.excerpt}」 <small>{t.item(item.reports)}</small>
          </li>
        ))}
      </ul>
      <small>{t.how}</small>
    </div>
  )
}
