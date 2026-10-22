'use client'

import { Button, toast, useDocumentInfo, useTranslation } from '@payloadcms/ui'
import { useState } from 'react'

// The back office is for the site owner; its text follows Payload's own admin language (zh / en).
const text = {
  zh: {
    title: '导入版本',
    ref: '分支、tag 或 commit（可空：按仓库地址，否则默认分支）',
    version: '版本号（可空：取 SKILL.md 里的，否则自动加 1）',
    button: '从仓库导入',
    running: '提交中…',
    saveFirst: '先保存 Skill，再导入。',
    queued: '已排队。导入要几十秒；刷新页面，在「最近导入」里看结果，新版本在「Skill 版本」里。',
    failed: '没有排上队',
  },
  en: {
    title: 'Import a version',
    ref: 'Branch, tag or commit (empty: the one in the address, else the default branch)',
    version: 'Version number (empty: from SKILL.md, else the next patch number)',
    button: 'Import from repository',
    running: 'Queuing…',
    saveFirst: 'Save the Skill first, then import.',
    queued: 'Queued. Importing takes a moment; reload the page to see the result under “Last import” and the new version under Skill versions.',
    failed: 'Not queued',
  },
}

const inputStyle = { width: '100%', padding: '6px 8px', border: '1px solid var(--theme-elevation-150)', borderRadius: '4px', background: 'var(--theme-input-bg)', color: 'inherit', font: 'inherit' }
const labelStyle = { display: 'block', fontSize: '0.8em', marginBottom: 'calc(var(--base) / 2)' }

/** The「导入版本」panel on a Skill: POST /api/skills/:id/import queues the `skill/import` job. */
export function ImportButton() {
  const { id } = useDocumentInfo()
  const { i18n } = useTranslation()
  const t = i18n.language.startsWith('zh') ? text.zh : text.en
  const [ref, setRef] = useState('')
  const [version, setVersion] = useState('')
  const [running, setRunning] = useState(false)

  async function run() {
    if (!id) {
      toast.info(t.saveFirst)
      return
    }
    setRunning(true)
    try {
      const response = await fetch(`/api/skills/${id}/import`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ref: ref.trim() || undefined, version: version.trim() || undefined }),
      })
      const data = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string }
      if (!response.ok || !data.ok) throw new Error(data.error || `HTTP ${response.status}`)
      toast.success(t.queued)
    } catch (error) {
      toast.error(`${t.failed}: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setRunning(false)
    }
  }

  return (
    <div style={{ marginBottom: 'var(--base)' }}>
      <strong style={{ display: 'block', marginBottom: 'calc(var(--base) / 2)' }}>{t.title}</strong>
      <label style={labelStyle}>
        {t.ref}
        <input onChange={(event) => setRef(event.target.value)} placeholder="main" style={inputStyle} type="text" value={ref} />
      </label>
      <label style={labelStyle}>
        {t.version}
        <input onChange={(event) => setVersion(event.target.value)} placeholder="1.0.0" style={inputStyle} type="text" value={version} />
      </label>
      <Button buttonStyle="secondary" disabled={running} onClick={run} size="medium">
        {running ? t.running : t.button}
      </Button>
    </div>
  )
}
