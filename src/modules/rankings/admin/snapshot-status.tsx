'use client'

import { Button, toast, useTranslation } from '@payloadcms/ui'
import { useEffect, useState } from 'react'

import type { QueuedResponse, SnapshotStatusResponse } from '../endpoints'

// The back office is for the site owner; its text follows Payload's own admin language (zh / en).
const text = {
  zh: {
    title: '排行快照',
    intro: '每周一上海时间 06:00 按全部计分的票重算一次，排行页只读快照。同一周再算一次会替换这一周的快照。',
    arena: '赛道',
    latest: '最近一次',
    votes: '用了多少票',
    models: '模型',
    votesNow: '现在计分的票',
    never: '还没算过',
    draft: '（准备中，不算）',
    week: (week: string, at: string) => `${week} 那一周（${at} 算好）`,
    run: '现在重算',
    working: '提交中…',
    queued: '已提交，算完以后刷新这一页就能看到。',
    notQueued: (error: string) => `后台任务没连上：${error}`,
    failedRequest: '提交失败',
  },
  en: {
    title: 'Ranking snapshots',
    intro: 'Recomputed from every counted vote each Monday at 06:00 Shanghai time; the rankings page only reads snapshots. Computing the same week again replaces its snapshot.',
    arena: 'Arena',
    latest: 'Latest',
    votes: 'Votes used',
    models: 'Models',
    votesNow: 'Counted votes now',
    never: 'Not computed yet',
    draft: '(draft, not computed)',
    week: (week: string, at: string) => `Week of ${week} (computed ${at})`,
    run: 'Compute now',
    working: 'Sending…',
    queued: 'Requested; reload this page once it has run.',
    notQueued: (error: string) => `The background jobs could not be reached: ${error}`,
    failedRequest: 'Request failed',
  },
}

const box = {
  marginBottom: 'var(--base)',
  padding: 'calc(var(--base) * 0.75)',
  border: '1px solid var(--theme-elevation-150)',
  borderRadius: 'var(--style-radius-m)',
  lineHeight: 1.5,
} as const

const cell = { padding: '0.35em 1em 0.35em 0', textAlign: 'left' as const, verticalAlign: 'top' as const }

/** Above the arenas list: each arena's latest snapshot, its counted votes now, and「现在重算」. */
export function SnapshotStatus() {
  const { i18n } = useTranslation()
  const t = i18n.language.startsWith('zh') ? text.zh : text.en
  const [status, setStatus] = useState<SnapshotStatusResponse | null>(null)
  const [sending, setSending] = useState(false)

  useEffect(() => {
    void fetch('/api/arenas/snapshot-status', { credentials: 'same-origin' })
      .then((response) => (response.ok ? (response.json() as Promise<SnapshotStatusResponse>) : null))
      .then((next) => next && setStatus(next))
  }, [])

  async function run() {
    setSending(true)
    try {
      const response = await fetch('/api/arenas/snapshot-run', { method: 'POST', credentials: 'same-origin' })
      const data = (await response.json()) as QueuedResponse & { error?: string }
      if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`)
      if (data.queued) toast.success(t.queued)
      else toast.warning(t.notQueued(data.error))
    } catch (error) {
      toast.error(`${t.failedRequest}: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setSending(false)
    }
  }

  const number = (value: number) => value.toLocaleString(i18n.language)

  return (
    <div style={box}>
      <strong>{t.title}</strong>
      <p style={{ margin: '0.25em 0 0.5em' }}>{t.intro}</p>
      {status === null ? (
        <p style={{ margin: 0 }}>…</p>
      ) : (
        <table style={{ borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={cell}>{t.arena}</th>
              <th style={cell}>{t.latest}</th>
              <th style={cell}>{t.votes}</th>
              <th style={cell}>{t.models}</th>
              <th style={cell}>{t.votesNow}</th>
            </tr>
          </thead>
          <tbody>
            {status.arenas.map((arena) => (
              <tr key={arena.arenaId}>
                <td style={cell}>
                  {arena.name} {!arena.published && <small>{t.draft}</small>}
                </td>
                <td style={cell}>{arena.latest ? t.week(arena.latest.week, new Date(arena.latest.computedAt).toLocaleString(i18n.language)) : t.never}</td>
                <td style={cell}>{arena.latest ? number(arena.latest.votes) : '—'}</td>
                <td style={cell}>{arena.latest ? number(arena.latest.models) : '—'}</td>
                <td style={cell}>{number(arena.votesNow)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div style={{ marginTop: 'calc(var(--base) / 2)' }}>
        <Button buttonStyle="secondary" size="small" disabled={sending || status === null} onClick={run}>
          {sending ? t.working : t.run}
        </Button>
      </div>
    </div>
  )
}
