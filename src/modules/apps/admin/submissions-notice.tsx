'use client'

import { Link, useTranslation } from '@payloadcms/ui'
import { useEffect, useState } from 'react'

const pendingList = '/admin/collections/app-submissions?where[status][equals]=pending'

// The back office is for the site owner; its text follows Payload's own admin language (zh / en).
const text = {
  zh: {
    title: (count: number) => `有 ${count} 条应用提交待审`,
    how: '打开一条，用右栏「处理」收录或标为重复；不收录的改成「未收录」并写好给提交人的说明。',
    open: '去处理 ›',
  },
  en: {
    title: (count: number) => `${count} app submissions are waiting for review`,
    how: 'Open one and use Handling on the right to list it or mark it as already listed; to turn one down, set Not listed and write the note to the submitter.',
    open: 'Review them ›',
  },
}

const box = {
  marginBottom: 'var(--base)',
  padding: 'calc(var(--base) * 0.75)',
  border: '1px solid var(--theme-warning-500)',
  borderRadius: 'var(--style-radius-m)',
  lineHeight: 1.5,
} as const

/** Above the apps list, only when there are any: submissions from members that wait for a decision. */
export function SubmissionsNotice() {
  const { i18n } = useTranslation()
  const t = i18n.language.startsWith('zh') ? text.zh : text.en
  const [pending, setPending] = useState(0)

  useEffect(() => {
    void fetch('/api/app-submissions?where[status][equals]=pending&limit=1&depth=0', { credentials: 'same-origin' })
      .then((response) => (response.ok ? (response.json() as Promise<{ totalDocs?: number }>) : null))
      .then((body) => setPending(body?.totalDocs ?? 0))
      .catch(() => setPending(0))
  }, [])

  if (pending === 0) return null

  return (
    <div style={box} role="status">
      <strong>{t.title(pending)}</strong>
      <p style={{ margin: '0.25em 0 0' }}>
        {t.how} <Link href={pendingList}>{t.open}</Link>
      </p>
    </div>
  )
}
