'use client'

import { Link, useTranslation } from '@payloadcms/ui'
import { useEffect, useState } from 'react'

import { recheckAfterDays, recheckDue, whereQuery } from '../profile/recheck'

// The back office is for the site owner; its text follows Payload's own admin language (zh / en).
const text = {
  zh: {
    title: (count: number) => `有 ${count} 个应用的资料超过 ${recheckAfterDays} 天没核对`,
    how: '打开应用，到官网核对定价和平台，改好后把右栏「资料核对时间」设成今天。',
    open: '查看这些应用 ›',
  },
  en: {
    title: (count: number) => `${count} apps haven't had their profile checked in ${recheckAfterDays} days`,
    how: 'Open each one, check its pricing and platforms against the website, then set Profile checked on (right) to today.',
    open: 'Show them ›',
  },
}

const box = {
  marginBottom: 'var(--base)',
  padding: 'calc(var(--base) * 0.75)',
  border: '1px solid var(--theme-warning-500)',
  borderRadius: 'var(--style-radius-m)',
  lineHeight: 1.5,
} as const

/** Above the apps list, only when there are any: published apps whose pricing and platforms are due for a check. */
export function RecheckNotice() {
  const { i18n } = useTranslation()
  const t = i18n.language.startsWith('zh') ? text.zh : text.en
  const [due, setDue] = useState<{ count: number; query: string } | null>(null)

  useEffect(() => {
    const query = whereQuery(recheckDue(new Date()))
    void fetch(`/api/apps?${query}&limit=1&depth=0`, { credentials: 'same-origin' })
      .then((response) => (response.ok ? (response.json() as Promise<{ totalDocs?: number }>) : null))
      .then((body) => setDue({ count: body?.totalDocs ?? 0, query }))
      .catch(() => setDue(null))
  }, [])

  if (!due || due.count === 0) return null

  return (
    <div style={box} role="status">
      <strong>{t.title(due.count)}</strong>
      <p style={{ margin: '0.25em 0 0' }}>
        {t.how} <Link href={`/admin/collections/apps?${due.query}`}>{t.open}</Link>
      </p>
    </div>
  )
}
