'use client'

import { Button, toast, useDocumentInfo, useTranslation } from '@payloadcms/ui'
import { useState } from 'react'

import type { TestFetchResult } from '../collect/fetch'

// The back office is for the site owner; its text follows Payload's own admin language (zh / en).
const text = {
  zh: {
    button: '试抓',
    running: '抓取中…',
    saveFirst: '先保存信源，再试抓。',
    failed: '抓取失败',
    summary: (count: number, undated: number, ms: number) =>
      `抓到 ${count} 条${undated ? `，其中 ${undated} 条没有日期` : ''}，用时 ${(ms / 1000).toFixed(1)} 秒。只是预览，没有写入。`,
    empty: '没抓到条目。检查地址，网页列表还要检查选择器。',
    undated: '无日期',
  },
  en: {
    button: 'Test fetch',
    running: 'Fetching…',
    saveFirst: 'Save the source first, then test it.',
    failed: 'Fetch failed',
    summary: (count: number, undated: number, ms: number) =>
      `${count} items${undated ? `, ${undated} without a date` : ''}, in ${(ms / 1000).toFixed(1)} s. Preview only, nothing stored.`,
    empty: 'No items found. Check the URL, and the selectors for a web list.',
    undated: 'no date',
  },
}

/** The「试抓」button on a source: POST /api/sources/:id/test-fetch and show what came back. */
export function TestFetchButton() {
  const { id } = useDocumentInfo()
  const { i18n } = useTranslation()
  const t = i18n.language.startsWith('zh') ? text.zh : text.en
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<TestFetchResult | null>(null)

  async function run() {
    if (!id) {
      toast.info(t.saveFirst)
      return
    }
    setRunning(true)
    setResult(null)
    try {
      const response = await fetch(`/api/sources/${id}/test-fetch`, { method: 'POST', credentials: 'same-origin' })
      const data = (await response.json()) as TestFetchResult & { error?: string }
      if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`)
      setResult(data)
      if (!data.ok) toast.error(`${t.failed}: ${data.error}`)
      else if (data.count === 0) toast.warning(t.empty)
      else toast.success(t.summary(data.count, data.undated, data.durationMs))
    } catch (error) {
      toast.error(`${t.failed}: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setRunning(false)
    }
  }

  return (
    <div style={{ marginBottom: 'var(--base)' }}>
      <Button buttonStyle="secondary" disabled={running} onClick={run} size="medium">
        {running ? t.running : t.button}
      </Button>
      {result?.ok && result.items.length > 0 && (
        <ol style={{ marginTop: 'calc(var(--base) / 2)', paddingLeft: '1.5em', lineHeight: 1.5 }}>
          {result.items.map((item) => (
            <li key={item.url}>
              <a href={item.url} rel="noreferrer" target="_blank">
                {item.title}
              </a>{' '}
              <small>
                {item.publishedAt ? new Date(item.publishedAt).toLocaleString() : t.undated}
                {item.signals?.points != null ? ` · ${item.signals.points} pts` : ''}
              </small>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
