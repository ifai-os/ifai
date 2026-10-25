'use client'

import { useTranslation } from '@payloadcms/ui'
import { useEffect, useState } from 'react'

import type { OpenArticleReportsResponse } from '../endpoints'

// The back office is for the site owner; its text follows Payload's own admin language (zh / en).
const text = {
  zh: {
    title: (total: number) => `有 ${total} 篇文章被举报，还没处理`,
    item: (reports: number) => `被举报 ${reports} 次`,
    how: '打开文章，把状态改成「已隐藏」，或者在侧栏「举报」里点「保留」。',
  },
  en: {
    title: (total: number) => `${total} reported articles nobody has dealt with yet`,
    item: (reports: number) => `reported ${reports} times`,
    how: 'Open each one and set its status to Hidden, or keep it from Reports in the sidebar.',
  },
}

const box = {
  marginBottom: 'var(--base)',
  padding: 'calc(var(--base) * 0.75)',
  border: '1px solid var(--theme-error-500)',
  borderRadius: 'var(--style-radius-m)',
  lineHeight: 1.5,
} as const

/** Above the articles list, only when there are any: reported articles still waiting for the site owner. */
export function OpenReports() {
  const { i18n } = useTranslation()
  const t = i18n.language.startsWith('zh') ? text.zh : text.en
  const [reports, setReports] = useState<OpenArticleReportsResponse | null>(null)

  useEffect(() => {
    void fetch('/api/articles/open-reports', { credentials: 'same-origin' })
      .then((response) => (response.ok ? (response.json() as Promise<OpenArticleReportsResponse>) : null))
      .then(setReports)
      .catch(() => setReports(null))
  }, [])

  if (!reports || reports.total === 0) return null

  return (
    <div style={box} role="status">
      <strong>{t.title(reports.total)}</strong>
      <ul style={{ margin: '0.25em 0', paddingLeft: '1.25em' }}>
        {reports.items.map((item) => (
          <li key={item.articleId} style={{ wordBreak: 'break-word' }}>
            <a href={`/admin/collections/articles/${item.articleId}`}>{item.title}</a> <small>{t.item(item.reports)}</small>
          </li>
        ))}
      </ul>
      <small>{t.how}</small>
    </div>
  )
}
