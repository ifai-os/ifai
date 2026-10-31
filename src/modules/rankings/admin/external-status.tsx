'use client'

import { Button, toast, useTranslation } from '@payloadcms/ui'
import { useEffect, useState } from 'react'

import type { ExternalStatusResponse, QueuedResponse } from '../endpoints'
import type { BoardLabel, ExternalSource } from '../external/sources'

// The back office is for the site owner; its text follows Payload's own admin language (zh / en).
const text = {
  zh: {
    title: '外部榜单',
    intro:
      '每天上海时间 07:30 同步一次。Arena 读它在 Hugging Face 公开的数据集，第一次和每周一读全部历史，别的日子只读最新一期；Artificial Analysis 读它免费接口当天的数，有变化才存一期。排行页按来源分开显示，不和盲测混排。',
    off: '采集总开关 COLLECT_ENABLED 没开：定时同步和「现在同步」都不会跑。',
    aaNoKey: 'Artificial Analysis：没填 ARTIFICIAL_ANALYSIS_API_KEY（在 artificialanalysis.ai 免费注册），不会同步；还没有数据的来源前台不显示。',
    board: '榜单',
    latest: '最新一期',
    fetched: '存入时间',
    days: '期数',
    models: '模型',
    never: '还没同步过',
    run: '现在同步',
    working: '提交中…',
    queued: '已提交，一两分钟后刷新这一页就能看到。',
    notQueued: (error: string) => `后台任务没连上：${error}`,
    failedRequest: '提交失败',
    sources: { arena: 'Arena', 'artificial-analysis': 'Artificial Analysis' },
    boards: {
      text: '文本',
      webdev: '网页开发',
      vision: '视觉',
      document: '文档',
      search: '搜索',
      textToImage: '文生图',
      imageEdit: '图像编辑',
      textToVideo: '文生视频',
      imageToVideo: '图生视频',
      videoEdit: '视频编辑',
      intelligence: '智能指数',
      textToSpeech: '语音合成',
    },
  },
  en: {
    title: 'Outside leaderboards',
    intro:
      'Synced every day at 07:30 Shanghai time. Arena comes from the dataset it publishes on Hugging Face: the whole history the first time and every Monday, the newest board on other days. Artificial Analysis comes from its free API as it is that day, stored only when the numbers changed. The rankings pages show each source on its own, never mixed with the blind test.',
    off: 'COLLECT_ENABLED is off: neither the daily sync nor “Sync now” will run.',
    aaNoKey: 'Artificial Analysis: ARTIFICIAL_ANALYSIS_API_KEY is not set (a free key from artificialanalysis.ai), so it is not synced; the site offers a source only once it has data.',
    board: 'Board',
    latest: 'Newest',
    fetched: 'Stored',
    days: 'Days',
    models: 'Models',
    never: 'Not synced yet',
    run: 'Sync now',
    working: 'Sending…',
    queued: 'Requested; reload this page in a minute or two.',
    notQueued: (error: string) => `The background jobs could not be reached: ${error}`,
    failedRequest: 'Request failed',
    sources: { arena: 'Arena', 'artificial-analysis': 'Artificial Analysis' },
    boards: {
      text: 'Text',
      webdev: 'WebDev',
      vision: 'Vision',
      document: 'Document',
      search: 'Search',
      textToImage: 'Text to image',
      imageEdit: 'Image edit',
      textToVideo: 'Text to video',
      imageToVideo: 'Image to video',
      videoEdit: 'Video edit',
      intelligence: 'Intelligence',
      textToSpeech: 'Text to speech',
    },
  },
} satisfies Record<'zh' | 'en', { sources: Record<ExternalSource, string>; boards: Record<BoardLabel, string> } & Record<string, unknown>>

const box = {
  marginBottom: 'var(--base)',
  padding: 'calc(var(--base) * 0.75)',
  border: '1px solid var(--theme-elevation-150)',
  borderRadius: 'var(--style-radius-m)',
  lineHeight: 1.5,
} as const

const cell = { padding: '0.35em 1em 0.35em 0', textAlign: 'left' as const, verticalAlign: 'top' as const }

/** Above the arenas list: each outside board's newest day, how many days are stored, and「现在同步」. */
export function ExternalStatus() {
  const { i18n } = useTranslation()
  const t = i18n.language.startsWith('zh') ? text.zh : text.en
  const [status, setStatus] = useState<ExternalStatusResponse | null>(null)
  const [sending, setSending] = useState(false)

  useEffect(() => {
    void fetch('/api/arenas/external-status', { credentials: 'same-origin' })
      .then((response) => (response.ok ? (response.json() as Promise<ExternalStatusResponse>) : null))
      .then((next) => next && setStatus(next))
  }, [])

  async function run() {
    setSending(true)
    try {
      const response = await fetch('/api/arenas/external-run', { method: 'POST', credentials: 'same-origin' })
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
      {status && !status.collecting && <p style={{ margin: '0 0 0.5em', color: 'var(--theme-error-500)' }}>{t.off}</p>}
      {status && !status.aaKey && <p style={{ margin: '0 0 0.5em' }}>{t.aaNoKey}</p>}
      {status === null ? (
        <p style={{ margin: 0 }}>…</p>
      ) : (
        <table style={{ borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={cell}>{t.board}</th>
              <th style={cell}>{t.latest}</th>
              <th style={cell}>{t.fetched}</th>
              <th style={cell}>{t.days}</th>
              <th style={cell}>{t.models}</th>
            </tr>
          </thead>
          <tbody>
            {status.boards.map((board) => (
              <tr key={`${board.source}/${board.board}`}>
                <td style={cell}>
                  {t.sources[board.source]} · {t.boards[board.label]}
                </td>
                <td style={cell}>{board.latest ?? t.never}</td>
                <td style={cell}>{board.fetchedAt ? new Date(board.fetchedAt).toLocaleString(i18n.language) : '—'}</td>
                <td style={cell}>{number(board.days)}</td>
                <td style={cell}>{board.models === null ? '—' : number(board.models)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div style={{ marginTop: 'calc(var(--base) / 2)' }}>
        <Button buttonStyle="secondary" size="small" disabled={sending || !status?.collecting} onClick={run}>
          {sending ? t.working : t.run}
        </Button>
      </div>
    </div>
  )
}
