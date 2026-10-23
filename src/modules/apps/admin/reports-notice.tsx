'use client'

import { Link, useTranslation } from '@payloadcms/ui'
import { useEffect, useState } from 'react'

import type { OpenAppReportsResponse } from '../reports/endpoints'
import type { ReportKind } from '../reports/rules'

// The back office is for the site owner; its text follows Payload's own admin language (zh / en).
const text = {
  zh: {
    title: (total: number, apps: number) => `有 ${apps} 个应用收到 ${total} 条报错，还没处理`,
    kinds: { 'wrong-info': '资料有误', 'shut-down': '已停运', other: '其他' } satisfies Record<ReportKind, string>,
    how: '打开应用，在「报错」标签里标记完成；已停运的可以直接下架。',
    all: '全部报错',
    separator: '、',
    colon: '：',
  },
  en: {
    title: (total: number, apps: number) => `${total} reports about ${apps} apps nobody has dealt with yet`,
    kinds: { 'wrong-info': 'wrong information', 'shut-down': 'shut down', other: 'other' } satisfies Record<ReportKind, string>,
    how: 'Open the app and mark them done in its Reports tab; delist one that has shut down.',
    all: 'All reports',
    separator: ', ',
    colon: ': ',
  },
}

const box = {
  marginBottom: 'var(--base)',
  padding: 'calc(var(--base) * 0.75)',
  border: '1px solid var(--theme-error-500)',
  borderRadius: 'var(--style-radius-m)',
  lineHeight: 1.5,
} as const

/** Above the apps list, only when there are any: apps whose readers reported a problem nobody has dealt with. */
export function ReportsNotice() {
  const { i18n } = useTranslation()
  const t = i18n.language.startsWith('zh') ? text.zh : text.en
  const [reports, setReports] = useState<OpenAppReportsResponse | null>(null)

  useEffect(() => {
    void fetch('/api/apps/reports', { credentials: 'same-origin' })
      .then((response) => (response.ok ? (response.json() as Promise<OpenAppReportsResponse>) : null))
      .then(setReports)
      .catch(() => setReports(null))
  }, [])

  if (!reports || reports.total === 0) return null

  return (
    <div style={box} role="status">
      <strong>{t.title(reports.total, reports.appCount)}</strong>
      <ul style={{ margin: '0.25em 0', paddingLeft: '1.25em' }}>
        {reports.apps.map((app) => (
          <li key={app.id} style={{ wordBreak: 'break-word' }}>
            <Link href={`/admin/collections/apps/${app.id}`}>{app.name}</Link>
            {t.colon}
            {Object.entries(app.kinds)
              .map(([kind, times]) => `${t.kinds[kind as ReportKind]} × ${times}`)
              .join(t.separator)}
          </li>
        ))}
      </ul>
      <small>
        {t.how} <Link href="/admin/collections/app-reports">{t.all}</Link>
      </small>
    </div>
  )
}
