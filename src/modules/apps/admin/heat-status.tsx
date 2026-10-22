'use client'

import { Button, toast, useTranslation } from '@payloadcms/ui'
import { useEffect, useState } from 'react'

import type { HeatRunResponse, HeatStatusResponse } from '../metrics/endpoints'

// The back office is for the site owner; its text follows Payload's own admin language (zh / en).
const text = {
  zh: {
    title: '热度',
    never: '还没算过。每天上海时间 06:00 自动算一次，也可以现在算。',
    done: (day: string, at: string, apps: number, mentions: number) =>
      `最近一次：${day}（${at} 算完），${apps} 个已发布应用，近 30 天匹配到 ${mentions} 条日报提及。每天上海时间 06:00 自动算。`,
    running: (at: string) => `正在计算，${at} 开始。`,
    failed: (day: string, error: string) => `${day} 的热度没算完：${error}`,
    showing: (day: string) => `页面仍显示 ${day} 的热度。`,
    noneShown: '页面还没有热度。',
    reused: (error: string) => `Tranco 名单没下载成功（${error}），网站排名沿用了之前的名次。`,
    list: (listId: string) => `Tranco 名单 ${listId}。`,
    run: '现在重算',
    working: '提交中…',
    queued: '已提交，算完会自动更新这里。',
    notQueued: (error: string) => `后台任务没连上：${error}`,
    failedRequest: '提交失败',
  },
  en: {
    title: 'Heat',
    never: 'Not computed yet. It runs every day at 06:00 Shanghai time; you can also run it now.',
    done: (day: string, at: string, apps: number, mentions: number) =>
      `Last run: ${day} (finished ${at}), ${apps} published apps, ${mentions} daily-story mentions in the last 30 days. Runs every day at 06:00 Shanghai time.`,
    running: (at: string) => `Running, started ${at}.`,
    failed: (day: string, error: string) => `The run for ${day} did not finish: ${error}`,
    showing: (day: string) => `The pages still show the heat of ${day}.`,
    noneShown: 'The pages have no heat yet.',
    reused: (error: string) => `The Tranco list could not be downloaded (${error}); the last known site ranks were kept.`,
    list: (listId: string) => `Tranco list ${listId}.`,
    run: 'Run now',
    working: 'Sending…',
    queued: 'Requested; this notice updates when the run finishes.',
    notQueued: (error: string) => `The background jobs could not be reached: ${error}`,
    failedRequest: 'Request failed',
  },
}

async function fetchStatus(): Promise<HeatStatusResponse | null> {
  const response = await fetch('/api/apps/heat-status', { credentials: 'same-origin' })
  return response.ok ? ((await response.json()) as HeatStatusResponse) : null
}

const POLL_MS = 5000
const POLL_FOR_MS = 5 * 60_000

const box = {
  marginBottom: 'var(--base)',
  padding: 'calc(var(--base) * 0.75)',
  border: '1px solid var(--theme-elevation-150)',
  borderRadius: 'var(--style-radius-m)',
  lineHeight: 1.5,
} as const

/** Above the apps list: when heat was last computed, whether Tranco was fresh, and「现在重算」. */
export function HeatStatus() {
  const { i18n } = useTranslation()
  const t = i18n.language.startsWith('zh') ? text.zh : text.en
  const [status, setStatus] = useState<HeatStatusResponse | null>(null)
  const [sending, setSending] = useState(false)
  const [requestedAt, setRequestedAt] = useState<number | null>(null)

  useEffect(() => {
    void fetchStatus().then((next) => next && setStatus(next))
  }, [])

  // After「现在重算」, look again every few seconds until a run started since then has finished.
  const latest = status?.latest ?? null
  const finishedSinceRequest =
    requestedAt !== null && latest !== null && latest.status !== 'running' && Date.parse(latest.startedAt) >= requestedAt
  useEffect(() => {
    if (requestedAt === null || finishedSinceRequest) return
    const timer = setInterval(() => {
      if (Date.now() - requestedAt > POLL_FOR_MS) setRequestedAt(null)
      else void fetchStatus().then((next) => next && setStatus(next))
    }, POLL_MS)
    return () => clearInterval(timer)
  }, [requestedAt, finishedSinceRequest])

  async function run() {
    setSending(true)
    try {
      const response = await fetch('/api/apps/heat-run', { method: 'POST', credentials: 'same-origin' })
      const data = (await response.json()) as HeatRunResponse & { error?: string }
      if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`)
      if (data.queued) {
        toast.success(t.queued)
        // A little slack for the clocks of the server and this browser.
        setRequestedAt(Date.now() - 60_000)
      } else {
        toast.warning(t.notQueued(data.error))
      }
    } catch (error) {
      toast.error(`${t.failedRequest}: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setSending(false)
    }
  }

  const when = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString(i18n.language) : '')
  const lastDone = status?.lastDone ?? null

  return (
    <div style={box}>
      <strong>{t.title}</strong>
      {status === null ? (
        <p style={{ margin: '0.25em 0 0' }}>…</p>
      ) : (
        <>
          {latest === null && <p style={{ margin: '0.25em 0 0' }}>{t.never}</p>}
          {latest?.status === 'running' && <p style={{ margin: '0.25em 0 0' }}>{t.running(when(latest.startedAt))}</p>}
          {latest?.status === 'failed' && (
            <p style={{ margin: '0.25em 0 0' }}>
              ⚠ {t.failed(latest.day, latest.error ?? '')} {lastDone ? t.showing(lastDone.day) : t.noneShown}
            </p>
          )}
          {lastDone && (
            <p style={{ margin: '0.25em 0 0' }}>
              {t.done(lastDone.day, when(lastDone.finishedAt), lastDone.apps ?? 0, lastDone.mentions ?? 0)}{' '}
              {lastDone.trancoStatus === 'reused' ? `⚠ ${t.reused(lastDone.trancoError ?? '')}` : ''}
              {lastDone.trancoListId ? <small> {t.list(lastDone.trancoListId)}</small> : null}
            </p>
          )}
        </>
      )}
      <div style={{ marginTop: 'calc(var(--base) / 2)' }}>
        {/* Not blocked while a run is going: the job runs one at a time, so a second request waits its turn. */}
        <Button buttonStyle="secondary" size="small" disabled={sending || status === null} onClick={run}>
          {sending ? t.working : t.run}
        </Button>
      </div>
    </div>
  )
}
