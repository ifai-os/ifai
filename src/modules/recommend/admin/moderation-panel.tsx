'use client'

import { Button, toast, useDocumentInfo, useTranslation } from '@payloadcms/ui'
import { useCallback, useEffect, useState } from 'react'

import type { ArticleModerationResponse } from '../endpoints'
import type { ReportReason } from '../writing'

// The back office is for the site owner; its text follows Payload's own admin language (zh / en).
const text = {
  zh: {
    author: '作者',
    editorial: 'IFAI 编辑部（后台写的）',
    gone: '作者已删除账号',
    noName: '（没有昵称）',
    readOnlyBody: '读者用 Markdown 写的，正文在这里不能改；有问题就隐藏。',
    reports: '举报',
    noReports: '没有人举报。',
    open: '待处理',
    resolved: '已处理',
    reasons: { spam: '广告或刷屏', abuse: '辱骂或冒犯', offTopic: '和 AI 无关', other: '其他' } satisfies Record<ReportReason, string>,
    how: '要隐藏，把状态改成「已隐藏」再保存；举报会一起标为已处理。',
    keep: '保留，举报不成立',
    kept: '已保留，举报标为已处理。',
    failedRequest: '操作失败',
  },
  en: {
    author: 'Author',
    editorial: 'IFAI editors (written here)',
    gone: 'The author deleted their account',
    noName: '(no nickname)',
    readOnlyBody: 'Written by a reader in Markdown, so the body cannot be changed here; hide it if it is a problem.',
    reports: 'Reports',
    noReports: 'Nobody has reported it.',
    open: 'open',
    resolved: 'dealt with',
    reasons: { spam: 'spam or flooding', abuse: 'abusive', offTopic: 'not about AI', other: 'other' } satisfies Record<ReportReason, string>,
    how: 'To hide it, set the status to Hidden and save; its reports are marked as dealt with too.',
    keep: 'Keep it, the reports were wrong',
    kept: 'Kept; its reports are marked as dealt with.',
    failedRequest: 'Failed',
  },
}

const box = {
  marginBottom: 'var(--base)',
  padding: 'calc(var(--base) * 0.75)',
  border: '1px solid var(--theme-elevation-150)',
  borderRadius: 'var(--style-radius-m)',
  lineHeight: 1.5,
  wordBreak: 'break-word',
} as const

const flagged = { color: 'var(--theme-error-500)' } as const

/** In an article's sidebar (docs/specs/recommend.md「后台」): who wrote it, and the reports on it with「保留」. */
export function ModerationPanel() {
  const { id } = useDocumentInfo()
  const { i18n } = useTranslation()
  const t = i18n.language.startsWith('zh') ? text.zh : text.en
  const [data, setData] = useState<ArticleModerationResponse | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async (): Promise<ArticleModerationResponse | null> => {
    const response = await fetch(`/api/articles/${id}/moderation`, { credentials: 'same-origin' })
    return response.ok ? ((await response.json()) as ArticleModerationResponse) : null
  }, [id])

  useEffect(() => {
    if (id) void load().then(setData, () => setData(null))
  }, [id, load])

  if (!id || !data) return null
  const open = data.reports.filter((report) => report.open)

  async function keep() {
    setBusy(true)
    try {
      const response = await fetch(`/api/articles/${id}/keep`, { method: 'POST', credentials: 'same-origin' })
      if (!response.ok) throw new Error(String(response.status))
      toast.success(t.kept)
      setData(await load())
    } catch {
      toast.error(t.failedRequest)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={box}>
      <strong>{t.author}</strong>
      <div>{data.author === null ? t.editorial : `${data.author.name || t.noName} · ${data.author.email}`}</div>
      {data.author !== null && <small>{t.readOnlyBody}</small>}
      {data.reports.length > 0 && (
        <>
          <div style={{ marginTop: 'calc(var(--base) * 0.5)' }}>
            <strong>{t.reports}</strong>
          </div>
          <ul style={{ margin: '0.25em 0', paddingLeft: '1.25em' }}>
            {data.reports.map((report, index) => (
              <li key={index} style={report.open ? flagged : undefined}>
                {t.reasons[report.reason]} · {new Date(report.reportedAt).toLocaleString(i18n.language)} · {report.open ? t.open : t.resolved}
              </li>
            ))}
          </ul>
          {open.length > 0 && (
            <>
              <small>{t.how}</small>
              <div>
                <Button buttonStyle="secondary" size="small" disabled={busy} onClick={() => void keep()}>
                  {t.keep}
                </Button>
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
