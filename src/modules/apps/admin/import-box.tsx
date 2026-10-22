'use client'

import { Button, TextareaInput, toast, useTranslation } from '@payloadcms/ui'
import { useState } from 'react'

import type { ImportResponse } from '../profile/endpoints'
import type { ImportProblem } from '../profile/import'

// The back office is for the site owner; its text follows Payload's own admin language (zh / en).
const text = {
  zh: {
    summary: '批量添加应用（粘贴官网网址）',
    label: '每行一个应用',
    description:
      '写「名称, 官网网址」，或者只写网址（先用域名当名称，生成草稿时换成官网上的名字）。已经收录的网站会跳过。每次最多 300 行。添加后自动生成资料草稿，状态是「草稿」，审核后再发布。',
    placeholder: 'Kitecode, https://kitecode.example\nhttps://lumen-chat.example',
    submit: '添加并生成草稿',
    working: '添加中…',
    empty: '先粘贴网址。',
    created: (count: number) => `新建 ${count} 个应用，都在等生成草稿。`,
    existing: (count: number) => `${count} 个已经收录，跳过：`,
    problems: (count: number) => `${count} 行没有添加：`,
    reasons: {
      'no-website': '没找到网址',
      duplicate: '网站和前面重复',
      'too-many': '超过 300 行',
      invalid: '保存失败',
    } satisfies Record<ImportProblem['reason'], string>,
    line: (line: number) => `第 ${line} 行`,
    sameAs: (line: number) => `（同第 ${line} 行）`,
    notQueued: (error: string) => `后台任务没连上（${error}），这些应用停在「待生成」，补漏任务会接着处理。`,
    reload: '刷新列表',
    failed: '添加失败',
  },
  en: {
    summary: 'Add apps in bulk (paste websites)',
    label: 'One app per line',
    description:
      'Write "Name, website", or only the website (named after its domain until the draft takes the name from the website). Websites already listed are skipped. Up to 300 lines at a time. Each new app gets a profile draft and stays a draft until you publish it.',
    placeholder: 'Kitecode, https://kitecode.example\nhttps://lumen-chat.example',
    submit: 'Add and draft',
    working: 'Adding…',
    empty: 'Paste some websites first.',
    created: (count: number) => `${count} apps added, each waiting for its draft.`,
    existing: (count: number) => `${count} already listed, skipped:`,
    problems: (count: number) => `${count} lines not added:`,
    reasons: {
      'no-website': 'no website found',
      duplicate: 'same website as an earlier line',
      'too-many': 'over 300 lines',
      invalid: 'could not be saved',
    } satisfies Record<ImportProblem['reason'], string>,
    line: (line: number) => `Line ${line}`,
    sameAs: (line: number) => ` (line ${line})`,
    notQueued: (error: string) => `The background jobs could not be reached (${error}); these apps wait as pending for the sweep.`,
    reload: 'Reload the list',
    failed: 'Import failed',
  },
}

/** Above the apps list: paste websites, get draft apps with profile drafts on the way. */
export function ImportBox() {
  const { i18n } = useTranslation()
  const t = i18n.language.startsWith('zh') ? text.zh : text.en
  const [value, setValue] = useState('')
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<ImportResponse | null>(null)

  async function submit() {
    if (!value.trim()) {
      toast.info(t.empty)
      return
    }
    setSending(true)
    setResult(null)
    try {
      const response = await fetch('/api/apps/import-websites', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: value }),
      })
      const data = (await response.json()) as ImportResponse & { error?: string }
      if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`)
      setResult(data)
      if (data.created.length > 0) toast.success(t.created(data.created.length))
      if (!data.queued.ok) toast.warning(t.notQueued(data.queued.error))
    } catch (error) {
      toast.error(`${t.failed}: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setSending(false)
    }
  }

  return (
    <details style={{ marginBottom: 'var(--base)' }} open={Boolean(result)}>
      <summary style={{ cursor: 'pointer', fontWeight: 600, marginBottom: 'calc(var(--base) / 2)' }}>{t.summary}</summary>
      <TextareaInput
        path="importWebsites"
        label={t.label}
        description={t.description}
        placeholder={t.placeholder}
        rows={8}
        value={value}
        onChange={(event) => setValue(event.target.value)}
      />
      <Button buttonStyle="primary" size="medium" disabled={sending} onClick={submit}>
        {sending ? t.working : t.submit}
      </Button>
      {result && (
        <div style={{ lineHeight: 1.5 }}>
          {result.created.length > 0 && <p>{t.created(result.created.length)}</p>}
          {result.existing.length > 0 && (
            <>
              <p style={{ marginBottom: 0 }}>{t.existing(result.existing.length)}</p>
              <ul style={{ marginTop: '0.25em', paddingLeft: '1.5em' }}>
                {result.existing.map((app) => (
                  <li key={app.line}>
                    {t.line(app.line)}：<a href={`/admin/collections/apps/${app.id}`}>{app.name}</a> <small>{app.website}</small>
                  </li>
                ))}
              </ul>
            </>
          )}
          {result.problems.length > 0 && (
            <>
              <p style={{ marginBottom: 0 }}>{t.problems(result.problems.length)}</p>
              <ul style={{ marginTop: '0.25em', paddingLeft: '1.5em' }}>
                {result.problems.map((problem) => (
                  <li key={`${problem.line}-${problem.reason}`} style={{ wordBreak: 'break-word' }}>
                    {t.line(problem.line)}：{t.reasons[problem.reason]}
                    {problem.firstLine ? t.sameAs(problem.firstLine) : ''}
                    {problem.detail ? `（${problem.detail}）` : ''} <small>{problem.text}</small>
                  </li>
                ))}
              </ul>
            </>
          )}
          {result.created.length > 0 && (
            <Button buttonStyle="secondary" size="small" onClick={() => window.location.reload()}>
              {t.reload}
            </Button>
          )}
        </div>
      )}
    </details>
  )
}
