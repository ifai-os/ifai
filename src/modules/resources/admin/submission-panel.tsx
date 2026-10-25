'use client'

import { Button, Link, toast, useDocumentInfo, useFormModified, useTranslation } from '@payloadcms/ui'
import { useEffect, useState } from 'react'

import type { Skill, SkillSubmission } from '@/payload-types'

import { skillCategories, skillCategoryLabels, type SkillCategory } from '../categories'
import type { ConvertResult, HandlingSkill, HandlingState } from '../submit/admin'

// The back office is for the site owner; its text follows Payload's own admin language (zh / en).
const text = {
  zh: {
    title: '处理',
    saveFirst: '保存后可以在这里处理。',
    decided: { accepted: '已收录。', rejected: '已拒绝。' } satisfies Record<Exclude<SkillSubmission['status'], 'pending'>, string>,
    skillStatus: { draft: '草稿', in_review: '待审', published: '已发布', delisted: '已下架' } satisfies Record<Skill['status'], string>,
    linked: '导入为',
    open: '打开 ›',
    waitingPublish: '这个 Skill 发布后，这条投稿自动改成「已收录」，并发邮件告诉投稿人。',
    notGithub: '仓库地址不是 GitHub 仓库，没法导入。',
    sameSource: '同一仓库已经有 Skill',
    linkPublished: '收录：关联这个 Skill',
    linkPublishedHint: '关联后改成「已收录」，发邮件附上它的页面。',
    linkDraft: '关联这个 Skill',
    linkDraftHint: '关联后，这个 Skill 发布时，这条投稿自动改成「已收录」。',
    category: '分类',
    pickCategory: '选分类…',
    convert: '转为 Skill',
    convertHint: '按仓库地址新建草稿 Skill（名字、网址名、作者先按仓库填，审核时再改），并开始导入版本；Skill 发布后，这条投稿自动改成「已收录」。',
    rejectHint: '不收录：把状态改成「已拒绝」，写好「给投稿人的说明」后保存。',
    unsaved: '表单里有没保存的修改：先保存或撤销，再操作。',
    needCategory: '先选分类。',
    created: '草稿 Skill 建好了，正在导入版本。',
    linkedDone: '已关联。',
    listedDone: '已收录，邮件会发给投稿人。',
    queueFailed: (error: string) => `草稿 Skill 建好了，但导入没排上（${error}）：到 Skill 的「导入版本」里再点一次。`,
    errors: {
      'not-found': '找不到这条投稿。',
      decided: '这条投稿已经处理过了。',
      'not-github': '仓库地址不是 GitHub 仓库。',
      category: '先选分类。',
    } satisfies Record<Exclude<ConvertResult, { ok: true }>['error'], string>,
    failedRequest: '操作失败',
  },
  en: {
    title: 'Handling',
    saveFirst: 'Save it first, then handle it here.',
    decided: { accepted: 'Listed.', rejected: 'Not listed.' } satisfies Record<Exclude<SkillSubmission['status'], 'pending'>, string>,
    skillStatus: { draft: 'draft', in_review: 'in review', published: 'published', delisted: 'delisted' } satisfies Record<Skill['status'], string>,
    linked: 'Imported as',
    open: 'Open ›',
    waitingPublish: 'Once this Skill is published, the submission becomes Listed by itself and the submitter gets an email.',
    notGithub: 'The address is not a GitHub repository, so it cannot be imported.',
    sameSource: 'A Skill from this repository already exists',
    linkPublished: 'List: link this Skill',
    linkPublishedHint: 'Links it and sets the submission to Listed; the email links to its page.',
    linkDraft: 'Link this Skill',
    linkDraftHint: 'Once linked, publishing this Skill makes the submission Listed.',
    category: 'Category',
    pickCategory: 'Pick a category…',
    convert: 'Make it a Skill',
    convertHint: 'Makes a draft Skill from the repository (name, slug and author start from the address; fix them while reviewing) and starts importing a version; once the Skill is published, the submission becomes Listed.',
    rejectHint: 'To turn it down: set the status to Not listed, write the note to the submitter, and save.',
    unsaved: 'The form has unsaved changes: save or undo them first.',
    needCategory: 'Pick a category first.',
    created: 'Draft Skill made; a version is being imported.',
    linkedDone: 'Linked.',
    listedDone: 'Listed; the submitter will get an email.',
    queueFailed: (error: string) => `Draft Skill made, but the import was not queued (${error}): click “Import from repository” on the Skill.`,
    errors: {
      'not-found': 'This submission no longer exists.',
      decided: 'This submission has already been handled.',
      'not-github': 'The address is not a GitHub repository.',
      category: 'Pick a category first.',
    } satisfies Record<Exclude<ConvertResult, { ok: true }>['error'], string>,
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
const selectStyle = { width: '100%', padding: '6px 8px', border: '1px solid var(--theme-elevation-150)', borderRadius: '4px', background: 'var(--theme-input-bg)', color: 'inherit', font: 'inherit' }

/**
 * 「处理」in a submission's sidebar (docs/specs/resources.md, «后台» 1): make it a draft Skill and
 * start the import, or link the Skill already made from the same repository. Turning one down is
 * the status field and the note to the submitter.
 */
export function SubmissionPanel() {
  const { id, lastUpdateTime } = useDocumentInfo()
  const { i18n } = useTranslation()
  const modified = useFormModified()
  const zh = i18n.language.startsWith('zh')
  const t = zh ? text.zh : text.en
  const [state, setState] = useState<HandlingState | null>(null)
  const [category, setCategory] = useState<SkillCategory | ''>('')
  const [busy, setBusy] = useState(false)

  // Read again after each save: a status changed in the form changes what the panel offers.
  useEffect(() => {
    if (!id) return
    void fetch(`/api/skill-submissions/${id}/handling`, { credentials: 'same-origin' })
      .then((response) => (response.ok ? (response.json() as Promise<HandlingState>) : null))
      .then(setState)
      .catch(() => setState(null))
  }, [id, lastUpdateTime])

  if (!id) return <div style={box}>{t.saveFirst}</div>
  if (!state) return <div style={box}>…</div>

  async function convert(needsCategory: boolean) {
    // The form still holds the old「导入为」and status; saving it after the action would undo it.
    if (modified) {
      toast.error(t.unsaved)
      return
    }
    if (needsCategory && !category) {
      toast.error(t.needCategory)
      return
    }
    setBusy(true)
    try {
      const response = await fetch(`/api/skill-submissions/${id}/convert`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(needsCategory ? { category } : {}),
      })
      const result = (await response.json()) as ConvertResult | { error?: string }
      if (!('ok' in result)) throw new Error(result.error || `HTTP ${response.status}`)
      if (!result.ok) throw new Error(t.errors[result.error])
      if (result.queued && !result.queued.ok) toast.warning(t.queueFailed(result.queued.error))
      else toast.success(result.created ? t.created : result.listed ? t.listedDone : t.linkedDone)
      window.location.reload()
    } catch (error) {
      toast.error(`${t.failedRequest}: ${error instanceof Error ? error.message : String(error)}`)
      setBusy(false)
    }
  }

  const { status, github, linked, sameSource } = state
  const existing = sameSource[0]
  const skillLine = (label: string, skill: HandlingSkill) => (
    <p style={{ margin: 0, wordBreak: 'break-word' }}>
      {label}: <strong>{skill.name}</strong> ({t.skillStatus[skill.status]}) <Link href={`/admin/collections/skills/${skill.id}`}>{t.open}</Link>
    </p>
  )

  return (
    <div style={box}>
      <strong>{t.title}</strong>
      {status !== 'pending' && <p style={{ margin: 0 }}>{t.decided[status]}</p>}
      {linked && skillLine(t.linked, linked)}
      {status === 'pending' && linked && linked.status !== 'published' && <p style={muted}>{t.waitingPublish}</p>}
      {status === 'pending' && !linked && existing && (
        <>
          {skillLine(t.sameSource, existing)}
          <Button buttonStyle="primary" size="small" margin={false} disabled={busy} onClick={() => void convert(false)}>
            {existing.status === 'published' ? t.linkPublished : t.linkDraft}
          </Button>
          <p style={muted}>{existing.status === 'published' ? t.linkPublishedHint : t.linkDraftHint}</p>
        </>
      )}
      {status === 'pending' && !linked && !existing && !github && <p style={{ margin: 0 }}>{t.notGithub}</p>}
      {status === 'pending' && !linked && !existing && github && (
        <>
          <label style={{ display: 'block', fontSize: '0.8em' }}>
            {t.category}
            <select
              disabled={busy}
              onChange={(event) => setCategory(event.target.value as SkillCategory | '')}
              style={selectStyle}
              value={category}
            >
              <option value="">{t.pickCategory}</option>
              {skillCategories.map((value) => (
                <option key={value} value={value}>
                  {zh ? skillCategoryLabels[value].zh : skillCategoryLabels[value].en}
                </option>
              ))}
            </select>
          </label>
          <Button buttonStyle="primary" size="small" margin={false} disabled={busy} onClick={() => void convert(true)}>
            {t.convert}
          </Button>
          <p style={muted}>{t.convertHint}</p>
        </>
      )}
      {status === 'pending' && <p style={muted}>{t.rejectHint}</p>}
    </div>
  )
}
