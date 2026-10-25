'use client'

import { Button, toast, useDocumentInfo, useTranslation } from '@payloadcms/ui'
import { useCallback, useEffect, useState } from 'react'

import type { AnswerProgressResponse, QueuedResponse } from '../endpoints'

// The back office is for the site owner; its text follows Payload's own admin language (zh / en).
const text = {
  zh: {
    title: '回答',
    colon: '：',
    saveFirst: '保存以后，这个模型所在赛道的每道使用中的题都会排队生成回答。',
    none: '还没有参加任何赛道。',
    counts: (done: number, questions: number) => `完成 ${done} / ${questions} 道题`,
    pending: (count: number) => `等待 ${count}`,
    failed: (count: number) => `失败 ${count}`,
    unusable: (count: number) => `不能用 ${count}（截断、提到自己或已隐藏）`,
    cost: (usd: string) => `花了 $${usd}`,
    note: '每 30 分钟生成一批；模型调用的总开关关着、或者今天的预算用完时会停下，下次接着。回答齐了再改成「参赛」。',
    generate: '现在生成',
    retry: '重新生成失败和不能用的',
    working: '提交中…',
    queued: '已提交，过一会儿刷新看看。',
    retried: (count: number) => (count ? `${count} 条回答重新排队了。` : '没有要重新生成的回答。'),
    notQueued: (error: string) => `后台任务没连上：${error}`,
    failedRequest: '提交失败',
  },
  en: {
    title: 'Answers',
    colon: ': ',
    saveFirst: 'Once saved, every question in use in this model’s arenas is queued for an answer.',
    none: 'Not in any arena yet.',
    counts: (done: number, questions: number) => `${done} of ${questions} questions done`,
    pending: (count: number) => `${count} waiting`,
    failed: (count: number) => `${count} failed`,
    unusable: (count: number) => `${count} unusable (cut off, naming itself, or hidden)`,
    cost: (usd: string) => `$${usd} spent`,
    note: 'Generated in batches every 30 minutes; paused while model calls are off or today’s budget is used up, then picked up again. Set the model to “Competing” once its answers are in.',
    generate: 'Generate now',
    retry: 'Redo failed and unusable answers',
    working: 'Sending…',
    queued: 'Requested; reload in a while.',
    retried: (count: number) => (count ? `${count} answers queued again.` : 'Nothing to redo.'),
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

/** On a contestant's page: its answers per arena, with「现在生成」and「重新生成失败和不能用的」. */
export function AnswersPanel() {
  const { i18n } = useTranslation()
  const t = i18n.language.startsWith('zh') ? text.zh : text.en
  const { id } = useDocumentInfo()
  const [progress, setProgress] = useState<AnswerProgressResponse | null>(null)
  const [sending, setSending] = useState(false)

  const load = useCallback(
    () =>
      fetch(`/api/arena-models/${id}/answers`, { credentials: 'same-origin' })
        .then((response) => (response.ok ? (response.json() as Promise<AnswerProgressResponse>) : null))
        .then((next) => {
          if (next) setProgress(next)
        }),
    [id],
  )

  useEffect(() => {
    if (id) void load()
  }, [id, load])

  if (!id) return <div style={box}>{t.saveFirst}</div>

  async function send(action: 'generate' | 'retry-failed') {
    setSending(true)
    try {
      const response = await fetch(`/api/arena-models/${id}/${action}`, { method: 'POST', credentials: 'same-origin' })
      const data = (await response.json()) as QueuedResponse & { error?: string }
      if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`)
      if (!data.queued) toast.warning(t.notQueued(data.error))
      else if (action === 'retry-failed') toast.success(t.retried(data.retried ?? 0))
      else toast.success(t.queued)
      await load()
    } catch (error) {
      toast.error(`${t.failedRequest}: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setSending(false)
    }
  }

  return (
    <div style={box}>
      <strong>{t.title}</strong>
      {progress === null ? (
        <p style={{ margin: '0.25em 0 0' }}>…</p>
      ) : progress.arenas.length === 0 ? (
        <p style={{ margin: '0.25em 0 0' }}>{t.none}</p>
      ) : (
        progress.arenas.map((arena) => (
          <div key={arena.arenaId} style={{ marginTop: '0.5em' }}>
            <div>
              <strong>{arena.name}</strong>
              {t.colon}
              {t.counts(arena.done, arena.questions)}
            </div>
            <small>
              {[
                arena.pending ? t.pending(arena.pending) : null,
                arena.failed ? `⚠ ${t.failed(arena.failed)}` : null,
                arena.unusable ? t.unusable(arena.unusable) : null,
                t.cost(arena.costUsd.toFixed(4)),
              ]
                .filter(Boolean)
                .join(' · ')}
            </small>
          </div>
        ))
      )}
      <p style={{ margin: '0.5em 0' }}>
        <small>{t.note}</small>
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5em' }}>
        <Button buttonStyle="secondary" size="small" disabled={sending} onClick={() => send('generate')}>
          {sending ? t.working : t.generate}
        </Button>
        <Button buttonStyle="secondary" size="small" disabled={sending} onClick={() => send('retry-failed')}>
          {t.retry}
        </Button>
      </div>
    </div>
  )
}
