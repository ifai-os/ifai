'use client'

import { useTranslation } from '@payloadcms/ui'
import { useEffect, useState } from 'react'

import { localeNames, locales } from '@/i18n/config'

import type { SubscriberCountsResponse } from '../endpoints'

// The back office is for the site owner; its text follows Payload's own admin language (zh / en).
const text = {
  zh: {
    title: '订阅者',
    subscribed: (count: number) => `已订阅 ${count} 人`,
    separator: '：',
    others: (unsubscribed: number, stopped: number) => `已退订 ${unsubscribed} 人，已停发 ${stopped} 人。`,
    failed: '人数没读出来，刷新试试。',
  },
  en: {
    title: 'Subscribers',
    subscribed: (count: number) => `${count} subscribed`,
    separator: ': ',
    others: (unsubscribed: number, stopped: number) => `${unsubscribed} unsubscribed, ${stopped} stopped.`,
    failed: 'Could not load the counts; try reloading.',
  },
}

const box = {
  marginBottom: 'var(--base)',
  padding: 'calc(var(--base) * 0.75)',
  border: '1px solid var(--theme-elevation-150)',
  borderRadius: 'var(--style-radius-m)',
  lineHeight: 1.5,
} as const

/** Above the subscriber list: how many readers there are, per language. */
export function SubscriberCounts() {
  const { i18n } = useTranslation()
  const t = i18n.language.startsWith('zh') ? text.zh : text.en
  const [counts, setCounts] = useState<SubscriberCountsResponse | null | 'failed'>(null)

  useEffect(() => {
    fetch('/api/subscribers/counts', { credentials: 'same-origin' })
      .then(async (response) => setCounts(response.ok ? ((await response.json()) as SubscriberCountsResponse) : 'failed'))
      .catch(() => setCounts('failed'))
  }, [])

  return (
    <div style={box}>
      <strong>{t.title}</strong>
      {counts === null && <p style={{ margin: '0.25em 0 0' }}>…</p>}
      {counts === 'failed' && <p style={{ margin: '0.25em 0 0' }}>{t.failed}</p>}
      {counts !== null && counts !== 'failed' && (
        <>
          <p style={{ margin: '0.25em 0 0' }}>
            {t.subscribed(counts.subscribed)}
            {counts.subscribed > 0 && `${t.separator}${locales.map((locale) => `${localeNames[locale]} ${counts.byLocale[locale]}`).join(' · ')}`}
          </p>
          <p style={{ margin: '0.25em 0 0' }}>{t.others(counts.unsubscribed, counts.stopped)}</p>
        </>
      )}
    </div>
  )
}
