'use client'

import { Button, Link, toast, useDocumentInfo, useFormModified, useTranslation } from '@payloadcms/ui'
import { useEffect, useState } from 'react'

import type { App } from '@/payload-types'

import type { HandlingApp } from '../submissions/admin'
import type { HandlingActionResponse, HandlingResponse } from '../submissions/endpoints'
import type { SubmissionStatus } from '../submissions/rules'

type Action = 'draft' | 'duplicate'

// The back office is for the site owner; its text follows Payload's own admin language (zh / en).
const text = {
  zh: {
    title: '处理',
    saveFirst: '保存后可以在这里处理。',
    decided: { accepted: '已收录。', duplicate: '已标为重复。', rejected: '未收录。' } satisfies Record<Exclude<SubmissionStatus, 'pending'>, string>,
    appStatus: { draft: '草稿', published: '已发布', delisted: '已下架' } satisfies Record<App['status'], string>,
    draftStatus: { pending: '资料草稿待生成', drafted: '资料草稿已生成', failed: '资料草稿没生成' } satisfies Record<NonNullable<App['draftStatus']>, string>,
    linked: '关联的应用',
    open: '打开 ›',
    waitingPublish: '这个应用发布后，这条提交自动改成「已收录」，并发邮件告诉提交人。',
    listedOnDomain: '同域名已经收录了',
    duplicate: '标为重复',
    duplicateHint: '改成「重复」，发邮件请提交人去看这个应用。',
    unpublishedOnDomain: '同域名已有没发布的应用',
    linkExisting: '收录：关联这个应用',
    linkHint: '关联后，这个应用发布时，这条提交自动改成「已收录」。',
    draft: '收录：生成草稿',
    draftHint: '按名称、官网和分类新建草稿应用，开始生成资料草稿；应用发布后，这条提交自动改成「已收录」。',
    rejectHint: '不收录：把状态改成「未收录」，写好「给提交人的说明」后保存。',
    unsaved: '表单里有没保存的修改：先保存或撤销，再操作。',
    drafted: '草稿应用建好了，正在生成资料草稿。',
    linkedDone: '已关联。',
    duplicated: '已标为重复，邮件会发给提交人。',
    queueFailed: (error: string) => `草稿应用建好了，但生成任务没排上（${error}）：到应用的「资料草稿」里再点「生成草稿」。`,
    errors: {
      'not-found': '找不到这条提交。',
      decided: '这条提交已经处理过了。',
      listed: '同域名已经有已发布的应用，请标为重复。',
      'not-listed': '同域名没有已发布的应用。',
      invalid: '没能建草稿应用',
    } satisfies Record<Exclude<HandlingActionResponse, { ok: true }>['error'], string>,
    failedRequest: '操作失败',
  },
  en: {
    title: 'Handling',
    saveFirst: 'Save it first, then handle it here.',
    decided: { accepted: 'Listed.', duplicate: 'Marked as already listed.', rejected: 'Not listed.' } satisfies Record<Exclude<SubmissionStatus, 'pending'>, string>,
    appStatus: { draft: 'draft', published: 'published', delisted: 'delisted' } satisfies Record<App['status'], string>,
    draftStatus: { pending: 'profile draft waiting', drafted: 'profile drafted', failed: 'profile draft not written' } satisfies Record<NonNullable<App['draftStatus']>, string>,
    linked: 'Linked app',
    open: 'Open ›',
    waitingPublish: 'Once this app is published, the submission becomes Listed by itself and the submitter gets an email.',
    listedOnDomain: 'Already listed on this domain',
    duplicate: 'Mark as already listed',
    duplicateHint: 'Sets it to Already listed and emails the submitter a link to this app.',
    unpublishedOnDomain: 'An unpublished app on this domain',
    linkExisting: 'List: link this app',
    linkHint: 'Once linked, publishing this app makes the submission Listed.',
    draft: 'List: make a draft',
    draftHint: 'Makes a draft app from the name, website and category and starts its profile draft; once the app is published, the submission becomes Listed.',
    rejectHint: 'To turn it down: set the status to Not listed, write the note to the submitter, and save.',
    unsaved: 'The form has unsaved changes: save or undo them first.',
    drafted: 'Draft app made; its profile draft is being written.',
    linkedDone: 'Linked.',
    duplicated: 'Marked as already listed; the submitter will get an email.',
    queueFailed: (error: string) => `Draft app made, but its profile draft was not queued (${error}): click “Generate draft” on the app.`,
    errors: {
      'not-found': 'This submission no longer exists.',
      decided: 'This submission has already been handled.',
      listed: 'A published app is already on this domain: mark it as already listed.',
      'not-listed': 'No published app on this domain.',
      invalid: 'Could not make the draft app',
    } satisfies Record<Exclude<HandlingActionResponse, { ok: true }>['error'], string>,
    failedRequest: 'Failed',
  },
}

const box = {
  marginBottom: 'var(--base)',
  padding: 'calc(var(--base) * 0.75)',
  border: '1px solid var(--theme-elevation-150)',
  borderRadius: 'var(--style-radius-m)',
  lineHeight: 1.5,
  display: 'flex',
  flexDirection: 'column',
  gap: 'calc(var(--base) * 0.5)',
} as const

const muted = { margin: 0, color: 'var(--theme-elevation-500)' } as const

/**
 * 「处理」in a submission's sidebar (docs/specs/apps.md 5e): list it by making a draft (or by
 * linking the unpublished app on its domain), or mark it as already listed. Turning one down is
 * the status field and the note to the submitter.
 */
export function SubmissionPanel() {
  const { id, lastUpdateTime } = useDocumentInfo()
  const { i18n } = useTranslation()
  const modified = useFormModified()
  const t = i18n.language.startsWith('zh') ? text.zh : text.en
  const [state, setState] = useState<HandlingResponse | null>(null)
  const [busy, setBusy] = useState(false)

  // Read again after each save: a status changed in the form changes what the panel offers.
  useEffect(() => {
    if (!id) return
    void fetch(`/api/app-submissions/${id}/handling`, { credentials: 'same-origin' })
      .then((response) => (response.ok ? (response.json() as Promise<HandlingResponse>) : null))
      .then(setState)
      .catch(() => setState(null))
  }, [id, lastUpdateTime])

  if (!id) return <div style={box}>{t.saveFirst}</div>
  if (!state) return <div style={box}>…</div>

  async function act(action: Action) {
    // The form still holds the old app and status; saving it after the action would undo it.
    if (modified) {
      toast.error(t.unsaved)
      return
    }
    setBusy(true)
    try {
      const response = await fetch(`/api/app-submissions/${id}/handling`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const result = (await response.json()) as HandlingActionResponse | { error?: string }
      if (!('ok' in result)) throw new Error(result.error || `HTTP ${response.status}`)
      if (!result.ok) throw new Error(result.detail ? `${t.errors[result.error]}: ${result.detail}` : t.errors[result.error])
      if (result.queued && !result.queued.ok) toast.warning(t.queueFailed(result.queued.error))
      else toast.success(action === 'duplicate' ? t.duplicated : result.created ? t.drafted : t.linkedDone)
      window.location.reload()
    } catch (error) {
      toast.error(`${t.failedRequest}: ${error instanceof Error ? error.message : String(error)}`)
      setBusy(false)
    }
  }

  const { status, linked, sameDomain } = state
  const listed = sameDomain.find((app) => app.status === 'published')
  const unpublished = sameDomain.find((app) => app.status !== 'published')
  const appLine = (label: string, app: HandlingApp) => (
    <p style={{ margin: 0, wordBreak: 'break-word' }}>
      {label}: <strong>{app.name}</strong> ({t.appStatus[app.status]}
      {app.draftStatus ? ` · ${t.draftStatus[app.draftStatus]}` : ''}) <Link href={`/admin/collections/apps/${app.id}`}>{t.open}</Link>
    </p>
  )

  return (
    <div style={box}>
      <strong>{t.title}</strong>
      {status !== 'pending' && <p style={{ margin: 0 }}>{t.decided[status]}</p>}
      {linked && appLine(t.linked, linked)}
      {status === 'pending' && linked && <p style={muted}>{t.waitingPublish}</p>}
      {status === 'pending' && !linked && listed && (
        <>
          {appLine(t.listedOnDomain, listed)}
          <Button buttonStyle="primary" size="small" margin={false} disabled={busy} onClick={() => void act('duplicate')}>
            {t.duplicate}
          </Button>
          <p style={muted}>{t.duplicateHint}</p>
        </>
      )}
      {status === 'pending' && !linked && !listed && (
        <>
          {unpublished && appLine(t.unpublishedOnDomain, unpublished)}
          <Button buttonStyle="primary" size="small" margin={false} disabled={busy} onClick={() => void act('draft')}>
            {unpublished ? t.linkExisting : t.draft}
          </Button>
          <p style={muted}>{unpublished ? t.linkHint : t.draftHint}</p>
        </>
      )}
      {status === 'pending' && <p style={muted}>{t.rejectHint}</p>}
    </div>
  )
}
