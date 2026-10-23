'use client'

import { Button, toast, useDocumentInfo, useFormModified, useTranslation } from '@payloadcms/ui'
import { useCallback, useEffect, useState } from 'react'

import type { AdminReport } from '../reports/admin'
import type { AppReportsResponse } from '../reports/endpoints'
import type { ReportKind } from '../reports/rules'

// The back office is for the site owner; its text follows Payload's own admin language (zh / en).
const text = {
  zh: {
    saveFirst: '保存并发布后，读者可以在详情页「信息有误？」里报错。',
    none: '还没有报错。',
    summary: (open: number, resolved: number) =>
      open > 0 ? `${open} 条待处理${resolved > 0 ? `，${resolved} 条已处理` : ''}。` : `${resolved} 条，都已处理。`,
    kinds: { 'wrong-info': '资料有误', 'shut-down': '已停运', other: '其他' } satisfies Record<ReportKind, string>,
    page: (language: string) => `${language}页面`,
    member: '会员',
    visitor: '游客',
    contact: '联系方式',
    noBody: '（没有写说明）',
    resolvedAt: (when: string) => `已处理 · ${when}`,
    resolve: '标记完成',
    resolveAll: (count: number) => `全部标记完成（${count} 条）`,
    resolved: (count: number) => `${count} 条标为已处理。`,
    delist: '下架这个应用',
    delistConfirm: '确认下架',
    delistHint: '应用改成「已下架」，列表和详情页不再显示；它待处理的报错全部标为已处理。',
    cancel: '取消',
    delisted: '已下架，待处理的报错都标为已处理。',
    unsaved: '表单里有没保存的修改：先保存或撤销，再下架。',
    failedRequest: '操作失败',
    colon: '：',
  },
  en: {
    saveFirst: 'Once saved and published, readers can report problems with “Something wrong?” on its page.',
    none: 'No reports yet.',
    summary: (open: number, resolved: number) =>
      open > 0 ? `${open} not dealt with${resolved > 0 ? `, ${resolved} dealt with` : ''}.` : `${resolved}, all dealt with.`,
    kinds: { 'wrong-info': 'Wrong information', 'shut-down': 'Shut down', other: 'Other' } satisfies Record<ReportKind, string>,
    page: (language: string) => `${language} page`,
    member: 'member',
    visitor: 'visitor',
    contact: 'Contact',
    noBody: '(no details)',
    resolvedAt: (when: string) => `Dealt with · ${when}`,
    resolve: 'Mark done',
    resolveAll: (count: number) => `Mark all done (${count})`,
    resolved: (count: number) => `${count} marked as dealt with.`,
    delist: 'Delist this app',
    delistConfirm: 'Yes, delist it',
    delistHint: 'The app becomes “Delisted” and leaves the lists and its page; its open reports are marked as dealt with.',
    cancel: 'Cancel',
    delisted: 'Delisted; its open reports are marked as dealt with.',
    unsaved: 'The form has unsaved changes: save or undo them first, then delist.',
    failedRequest: 'Failed',
    colon: ': ',
  },
}

const box = {
  marginBottom: 'var(--base)',
  padding: 'calc(var(--base) * 0.75)',
  border: '1px solid var(--theme-elevation-150)',
  borderRadius: 'var(--style-radius-m)',
  lineHeight: 1.5,
} as const

const row = {
  padding: 'calc(var(--base) * 0.5) 0',
  borderTop: '1px solid var(--theme-elevation-100)',
} as const

const muted = { color: 'var(--theme-elevation-500)' } as const

type Change = { resolve: number[] | 'all' } | { delist: true }

/** The「报错」tab of an app: what readers reported, the open ones first; mark them done, or delist an app that has shut down. */
export function ReportsPanel() {
  const { id } = useDocumentInfo()
  const { i18n } = useTranslation()
  const modified = useFormModified()
  const t = i18n.language.startsWith('zh') ? text.zh : text.en
  const [state, setState] = useState<AppReportsResponse | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)

  const load = useCallback(async (): Promise<AppReportsResponse | null> => {
    const response = await fetch(`/api/apps/${id}/reports`, { credentials: 'same-origin' })
    return response.ok ? ((await response.json()) as AppReportsResponse) : null
  }, [id])

  useEffect(() => {
    if (id) void load().then((next) => next && setState(next))
  }, [id, load])

  if (!id) return <div style={box}>{t.saveFirst}</div>

  async function change(body: Change) {
    if ('delist' in body && modified) {
      toast.error(t.unsaved)
      return
    }
    setBusy(true)
    try {
      const response = await fetch(`/api/apps/${id}/reports`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = (await response.json()) as { ok?: boolean; resolved?: number; error?: string }
      if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`)
      if ('delist' in body) {
        toast.success(t.delisted)
        // The form still holds the old status; reload it rather than let a later save publish the app again.
        window.location.reload()
        return
      }
      toast.success(t.resolved(data.resolved ?? 0))
      const next = await load()
      if (next) setState(next)
    } catch (error) {
      toast.error(`${t.failedRequest}: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setBusy(false)
    }
  }

  if (state === null) return <div style={box}>…</div>
  const { reports, appStatus } = state
  if (reports.length === 0) return <div style={box}>{t.none}</div>

  const open = reports.filter((report) => report.status === 'open')
  const canDelist = appStatus === 'published' && open.some((report) => report.kind === 'shut-down')
  const when = (iso: string) => new Date(iso).toLocaleString(i18n.language)
  const languageName = (tag: string) => {
    try {
      return new Intl.DisplayNames([i18n.language], { type: 'language' }).of(tag) ?? tag
    } catch {
      return tag
    }
  }

  return (
    <div style={box}>
      <p style={{ margin: '0 0 0.5em' }}>{t.summary(open.length, reports.length - open.length)}</p>
      {(open.length > 1 || canDelist) && (
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.5em', margin: '0 0 0.5em' }}>
          {open.length > 1 && (
            <Button buttonStyle="secondary" size="small" margin={false} disabled={busy} onClick={() => change({ resolve: 'all' })}>
              {t.resolveAll(open.length)}
            </Button>
          )}
          {canDelist && !confirming && (
            <Button buttonStyle="secondary" size="small" margin={false} disabled={busy} onClick={() => setConfirming(true)}>
              {t.delist}
            </Button>
          )}
        </div>
      )}
      {canDelist && confirming && (
        <div style={{ margin: '0 0 0.5em' }}>
          <p style={{ margin: '0 0 0.25em' }}>{t.delistHint}</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5em' }}>
            <Button buttonStyle="primary" size="small" margin={false} disabled={busy} onClick={() => change({ delist: true })}>
              {t.delistConfirm}
            </Button>
            <Button buttonStyle="secondary" size="small" margin={false} disabled={busy} onClick={() => setConfirming(false)}>
              {t.cancel}
            </Button>
          </div>
        </div>
      )}
      {reports.map((report) => (
        <ReportRow key={report.id} report={report} t={t} when={when} languageName={languageName} busy={busy} onResolve={() => change({ resolve: [report.id] })} />
      ))}
    </div>
  )
}

function ReportRow({
  report,
  t,
  when,
  languageName,
  busy,
  onResolve,
}: {
  report: AdminReport
  t: (typeof text)['zh'] | (typeof text)['en']
  when: (iso: string) => string
  languageName: (tag: string) => string
  busy: boolean
  onResolve: () => void
}) {
  const done = report.status === 'resolved'
  const facts = [when(report.createdAt), report.locale ? t.page(languageName(report.locale)) : null, report.from === 'member' ? t.member : t.visitor]
  return (
    <div style={{ ...row, ...(done ? muted : {}) }}>
      <p style={{ margin: 0 }}>
        <strong>{t.kinds[report.kind]}</strong> · <small>{facts.filter(Boolean).join(' · ')}</small>
        {report.contact && (
          <small style={{ wordBreak: 'break-word' }}>
            {' '}
            · {t.contact}
            {t.colon}
            {report.contact}
          </small>
        )}
      </p>
      {report.body ? (
        <p lang={report.lang} style={{ margin: '0.25em 0', whiteSpace: 'pre-line', wordBreak: 'break-word' }}>
          {report.body}
        </p>
      ) : (
        <p style={{ margin: '0.25em 0' }}>{t.noBody}</p>
      )}
      {done ? (
        <small>{t.resolvedAt(report.resolvedAt ? when(report.resolvedAt) : '—')}</small>
      ) : (
        <Button buttonStyle="secondary" size="small" margin={false} disabled={busy} onClick={onResolve}>
          {t.resolve}
        </Button>
      )}
    </div>
  )
}
